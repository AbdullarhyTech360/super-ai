import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import perf_counter
from typing import Annotated

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import func
from sqlmodel import Session
from starlette.background import BackgroundTask

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.db.database import create_db_and_tables, engine
from app.db.session import get_session
from app.models.forms import Login, SignUp
from app.models.user import User
from app.schemas.conversation_role import ConversationBulkDeleteRequest, Rename_request
from app.schemas.user import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ProfileUpdate,
    ResendVerificationRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.services.conversation_ai import (
    MODEL_PROFILES,
    generate_title,
    resolve_model,
    stream_message_events,
)
from app.services.email import send_password_reset_email, send_verification_email
from app.services.rate_limit import (
    chat_limit,
    email_limit,
    login_limit,
    signup_limit,
)
from app.services.uploads import (
    IMAGE_TYPES,
    MAX_FILES_PER_MESSAGE,
    UPLOADS_DIR,
    attachment_url,
    build_ai_parts,
    save_image_upload,
    save_upload,
)
from app.services.ttl_cache import TtlCache

SECRET_KEY = os.environ.get("SECRET_KEY", "your_secret_key_here")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
RESET_TOKEN_EXPIRE_MINUTES = int(os.environ.get("RESET_TOKEN_EXPIRE_MINUTES", "30"))
VERIFY_TOKEN_EXPIRE_MINUTES = int(os.environ.get("VERIFY_TOKEN_EXPIRE_MINUTES", "30"))
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000")

# Every turn re-sends the conversation history to the model, so it is capped:
# an unbounded transcript makes each answer slower than the last.
HISTORY_MAX_MESSAGES = int(os.environ.get("CHAT_HISTORY_MAX_MESSAGES", "20"))
HISTORY_MAX_CHARS = int(os.environ.get("CHAT_HISTORY_MAX_CHARS", "12000"))

# The title is generated beside the answer, so this only bounds how long the
# stream waits for it after the answer is complete.
TITLE_WAIT_SECONDS = float(os.environ.get("CHAT_TITLE_WAIT_SECONDS", "10"))

# What the turn is doing, in words the user can read. Every stage name the
# stream reports has to appear here, or the label falls back to the raw key.
CHAT_STAGES = {
    "searching": "Searching the web",
    "reading_files": "Reading your files",
    "gathering": "Gathering context",
    "thinking": "Thinking",
    "answering": "Answering",
}

# Chat opens with a page of conversation headers instead of the whole history,
# so opening the page stays fast no matter how long the account has existed.
CONVERSATIONS_PAGE_SIZE = int(os.environ.get("CHAT_LIST_PAGE_SIZE", "50"))
CONVERSATIONS_PAGE_MAX = int(os.environ.get("CHAT_LIST_PAGE_MAX", "200"))
MESSAGE_PAGE_SIZE = int(os.environ.get("CHAT_MESSAGE_PAGE_SIZE", "200"))
MESSAGE_PAGE_MAX = int(os.environ.get("CHAT_MESSAGE_PAGE_MAX", "1000"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/user")

password_hash = PasswordHash.recommended()

app = FastAPI()

origins = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:8080,http://localhost",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Cache the CORS preflight for a day. The chat POST carries an Authorization
    # header, so it is not a "simple" request and the browser sends an OPTIONS
    # probe first; without this every message pays an extra round-trip before the
    # real request is even issued.
    max_age=86400,
)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
sessionDep = Annotated[Session, Depends(get_session)]


# Create some helpers
def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Implement your password verification logic here
    return password_hash.verify(plain_password, hashed_password)


def authenticate_user(email: str, password: str, session: Session) -> User:
    user = session.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        print("Authentication failed for user:", email)
        return None
    return user


# Auth looked the user row up in the database on every single request, which
# on a remote database is a full round-trip paid before any endpoint can start.
# The JWT already names the user, so the row is kept as a read-only snapshot
# in-process for a short window; endpoints that change the account re-fetch a
# managed row and drop the entry so the edit is visible immediately.
USER_CACHE_TTL_SECONDS = float(os.environ.get("USER_CACHE_TTL_SECONDS", "900"))
_user_cache: dict[str, tuple[float, User]] = {}
_user_cache_lock = threading.Lock()


def _user_cache_get(email: str) -> User | None:
    entry = _user_cache.get(email)
    if entry is None:
        return None
    fetched_at, user = entry
    if perf_counter() - fetched_at > USER_CACHE_TTL_SECONDS:
        with _user_cache_lock:
            _user_cache.pop(email, None)
        return None
    return user


def _user_cache_put(email: str, user: User) -> None:
    with _user_cache_lock:
        _user_cache[email] = (perf_counter(), user)


def _user_cache_invalidate(email: str) -> None:
    with _user_cache_lock:
        _user_cache.pop(email, None)


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Session = Depends(get_session),
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    cached = _user_cache_get(email)
    if cached is not None:
        return cached

    started = perf_counter()
    user = session.query(User).filter(User.email == email).first()
    print(
        f"[db] user lookup {round((perf_counter() - started) * 1000)}ms "
        "(cache miss)"
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Detach the cached copy from this request's session so no later flush in
    # the request can silently write it back; it is a read-only snapshot.
    session.expunge(user)
    _user_cache_put(email, user)
    return user


def _managed_user(session: Session, user_id: str) -> User:
    """Re-read the user row inside the caller's session.

    get_current_user can hand out a cached snapshot that belongs to no session;
    an endpoint that mutates or deletes the account needs a live managed
    instance instead, or the change would never reach the database.
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# The ownership check of an ongoing conversation was a database round-trip on
# every turn's critical path, and its answer never changes while this process
# runs: conversations are created, renamed and deleted through this same
# single-worker app, and the delete endpoints drop their entries here. Only
# the owner id is needed to authorize a turn — the row itself is fetched by
# the background task, off the user's path.
CONVERSATION_OWNER_CACHE_SECONDS = float(
    os.environ.get("CONVERSATION_OWNER_CACHE_SECONDS", "3600")
)
_conversation_owner = TtlCache(
    CONVERSATION_OWNER_CACHE_SECONDS, max_entries=512
)


def _conversation_owner_id(session: Session, conversation_id: str) -> str | None:
    from app.models.chat import Conversation

    cached = _conversation_owner.get(conversation_id)
    if cached is not None:
        return cached
    started = perf_counter()
    conversation = session.get(Conversation, conversation_id)
    print(
        f"[db] conversation lookup {round((perf_counter() - started) * 1000)}ms "
        "(cache miss)"
    )
    if conversation is None:
        return None
    _conversation_owner.set(conversation_id, conversation.user_id)
    return conversation.user_id


def _trim_history(
    history: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    """Keep the newest turns within the message and character budgets.

    The history is re-sent to the model on every turn, so without a cap both
    the prompt and the time to first token grow with the conversation length.
    """
    if not history:
        return []
    kept: list[tuple[str, str]] = []
    budget = HISTORY_MAX_CHARS
    for sender, text in reversed(history[-HISTORY_MAX_MESSAGES:]):
        if kept and len(text) > budget:
            break
        budget -= len(text)
        kept.append((sender, text))
    kept.reverse()
    return kept


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


@app.on_event("startup")
def startup_event():
    # Perform any startup tasks here, such as initializing resources or connections
    print("Starting up the application...")
    _log_email_config()
    create_db_and_tables()
    migrate_schema()
    # The two calls above leave a live database connection in the pool, so the
    # first request no longer pays a cold Postgres handshake. The Gemini hosts
    # are the other cold start — DNS + TLS over a slow link cost seconds on the
    # first model call, which is why the turn right after a reload could show a
    # ~5s ttfb while later ones sat near 3s. Warm both SDK clients off-thread;
    # failures are fine, they only give that first request its old cost back.
    threading.Thread(
        target=_warm_gemini_connections, name="gemini-warmup", daemon=True
    ).start()


def _warm_gemini_connections() -> None:
    try:
        from app.services import rag
        from app.services.conversation_ai import client

        for sdk_client in (client, rag.embedding_client()):
            for _ in sdk_client.models.list():
                break
    except Exception as exc:  # pragma: no cover - best-effort warm-up
        print(f"[startup] Gemini connection warm-up failed: {exc}")


def migrate_schema():
    """Idempotently apply schema changes that create_all cannot handle."""
    from sqlalchemy import text

    from app.db.database import engine
    from app.services import rag

    if rag.is_enabled():
        rag.ensure_schema(engine)

    with engine.begin() as conn:
        # Column is added WITHOUT a default so existing rows become NULL and are
        # backfilled as verified below (no current user gets locked out). New
        # signups always set is_verified explicitly via the model.
        conn.execute(
            text('ALTER TABLE "user" ' "ADD COLUMN IF NOT EXISTS is_verified BOOLEAN")
        )
        # Backfill existing accounts as verified so no current user is locked out.
        # New users (is_verified = FALSE) are never touched.
        conn.execute(
            text('UPDATE "user" SET is_verified = TRUE WHERE is_verified IS NULL')
        )


def _log_email_config() -> None:
    """Log the resolved email configuration so the active provider is visible
    in the deployment logs (secrets are never printed)."""
    from app.services.email import _config

    config = _config()
    print(
        "[config] email provider = "
        f"{config['provider']} | from = {config['from']} | "
        f"resend key set = {'yes' if config['api_key'] else 'no'} | "
        f"frontend base = {FRONTEND_BASE_URL}"
    )


def _verification_token(email: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=VERIFY_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {
            "sub": email,
            "type": "email_verification",
            "exp": expires,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _send_verification_link(email: str) -> None:
    token = _verification_token(email)
    verify_url = f"{FRONTEND_BASE_URL}/verify-email?token={token}"
    try:
        send_verification_email(email, verify_url)
    except Exception as exc:  # pragma: no cover - best-effort email delivery
        print(f"[email] Failed to send verification email to {email}: {exc}")


# Create a route to create a new user
@app.post("/api/auth/signup")
def create_user(
    user_data: SignUp,
    session: sessionDep,
    _rate: None = Depends(signup_limit),
):
    # First check if the user already exists in the database using the provided email
    existing_user = session.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400, detail="User with this email already exists."
        )

    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=password_hash.hash(user_data.password),
        is_verified=False,
    )
    # If the user does not exist, add the new user to the database

    session.add(new_user)
    session.commit()
    session.refresh(new_user)  # Refresh the user instance to get the generated ID

    # Send the email confirmation link after the account is created.
    _send_verification_link(new_user.email)

    return {
        "message": "Account created successfully. A confirmation link has been sent to your email.",
        "user_id": new_user.id,
    }


@app.post("/api/auth/verify-email")
def verify_email(verify_request: VerifyEmailRequest, session: sessionDep):
    try:
        payload = jwt.decode(verify_request.token, SECRET_KEY, algorithms=[ALGORITHM])
    except InvalidTokenError:
        raise HTTPException(
            status_code=400, detail="Invalid or expired verification link."
        )

    if payload.get("type") != "email_verification" or payload.get("sub") is None:
        raise HTTPException(
            status_code=400, detail="Invalid or expired verification link."
        )

    user = session.query(User).filter(User.email == payload.get("sub")).first()
    if user is None:
        raise HTTPException(
            status_code=400, detail="Invalid or expired verification link."
        )

    if not user.is_verified:
        user.is_verified = True
        session.add(user)
        session.commit()

    return {"message": "Email verified successfully. You can now sign in."}


@app.post("/api/auth/resend-verification")
def resend_verification(
    resend_request: ResendVerificationRequest,
    session: sessionDep,
    _rate: None = Depends(email_limit),
):
    user = session.query(User).filter(User.email == resend_request.email).first()
    if user and not user.is_verified:
        _send_verification_link(user.email)

    # Always return the same message to avoid leaking which emails are registered.
    return {
        "message": "If an account exists for that email and is not verified, a new confirmation link has been sent."
    }


@app.get("/api/get/user")
def get_user(email: str, session: sessionDep):
    # Query the database for the user with the provided email
    user = session.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user_id": user.id, "email": user.email}


@app.post("/api/auth/login")
def authenticate_user_route(
    form_data: Login,
    session: sessionDep,
    _rate: None = Depends(login_limit),
):
    user = authenticate_user(form_data.email, form_data.password, session)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address first. A confirmation link was sent to your email.",
        )

    expires = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    # Generate a JWT token for the authenticated user
    token_data = {
        "sub": user.email,
        "exp": expires,
    }
    token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

    return {"access_token": token, "token_type": "bearer"}


@app.post("/api/auth/forgot-password")
def forgot_password(
    forgot_request: ForgotPasswordRequest,
    session: sessionDep,
    _rate: None = Depends(email_limit),
):
    user = session.query(User).filter(User.email == forgot_request.email).first()
    if user:
        expires = datetime.now(timezone.utc) + timedelta(
            minutes=RESET_TOKEN_EXPIRE_MINUTES
        )
        reset_token = jwt.encode(
            {
                "sub": user.email,
                "type": "password_reset",
                "exp": expires,
            },
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        reset_url = f"{FRONTEND_BASE_URL}/reset-password?token={reset_token}"
        try:
            send_password_reset_email(user.email, reset_url, RESET_TOKEN_EXPIRE_MINUTES)
        except Exception as exc:  # pragma: no cover - best-effort email delivery
            print(f"[email] Failed to send password reset email to {user.email}: {exc}")

    # Always return the same message to avoid leaking which emails are registered.
    return {
        "message": "If an account exists for that email, a reset link has been sent."
    }


@app.post("/api/auth/reset-password")
def reset_password(reset_request: ResetPasswordRequest, session: sessionDep):
    try:
        payload = jwt.decode(reset_request.token, SECRET_KEY, algorithms=[ALGORITHM])
    except InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    if payload.get("type") != "password_reset" or payload.get("sub") is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    email = payload.get("sub")
    user = session.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    new_password = reset_request.new_password
    if len(new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 6 characters long.",
        )

    user.hashed_password = password_hash.hash(new_password)
    session.add(user)
    session.commit()
    return {"message": "Password has been reset successfully."}


@app.get("/api/me")
def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_user)],
):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "avatar_url": (
            attachment_url(current_user.id, current_user.avatar_path)
            if current_user.avatar_path
            else None
        ),
    }


@app.put("/api/me")
def update_current_user_info(
    profile_update: ProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    full_name = " ".join(profile_update.full_name.split())
    if not full_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")

    user = _managed_user(session, current_user.id)
    user.full_name = full_name
    session.add(user)
    session.commit()
    _user_cache_invalidate(current_user.email)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar_url": (
            attachment_url(user.id, user.avatar_path)
            if user.avatar_path
            else None
        ),
    }


@app.delete("/api/me")
def delete_current_user_account(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    import shutil

    from app.models.chat import Conversation, Message

    user = _managed_user(session, current_user.id)
    conversations = (
        session.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .all()
    )

    stored_paths = []
    for conversation in conversations:
        messages = (
            session.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .all()
        )
        for message in messages:
            stored_paths.extend(
                attachment.stored_path for attachment in message.attachments
            )

    # Deleting conversations cascades to their messages and attachments
    # (ORM cascade), then the user row is removed.
    for conversation in conversations:
        session.delete(conversation)
    session.flush()

    session.delete(user)
    session.commit()
    _user_cache_invalidate(current_user.email)
    for conversation in conversations:
        _conversation_owner.delete(conversation.id)

    # Remove the account's stored files from disk (chat attachments + avatar).
    for stored_path in stored_paths:
        target = UPLOADS_DIR / user.id / stored_path
        target.unlink(missing_ok=True)
    shutil.rmtree(UPLOADS_DIR / user.id, ignore_errors=True)

    return {"message": "Your account has been deleted."}


@app.post("/api/me/avatar")
def upload_current_user_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
    file: UploadFile = File(...),
):
    mime_type = (file.content_type or "").lower()
    if mime_type not in IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Please upload a valid image (JPEG, PNG, WebP, GIF, SVG, BMP, or HEIC).",
        )

    avatar_path, _, _, _ = save_image_upload(current_user.id, file)
    old_path = current_user.avatar_path
    user = _managed_user(session, current_user.id)
    user.avatar_path = avatar_path
    session.add(user)
    session.commit()
    _user_cache_invalidate(current_user.email)

    if old_path:
        (UPLOADS_DIR / user.id / old_path).unlink(missing_ok=True)

    return {"avatar_url": attachment_url(user.id, avatar_path)}


@app.post("/api/change-password")
def change_current_user_password(
    change_request: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    if not verify_password(
        change_request.current_password, current_user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    new_password = change_request.new_password
    if len(new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 6 characters long.",
        )

    user = _managed_user(session, current_user.id)
    user.hashed_password = password_hash.hash(new_password)
    session.add(user)
    session.commit()
    _user_cache_invalidate(current_user.email)
    return {"message": "Password updated successfully."}


@app.get("/api/export")
def export_current_user_data(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Attachment, Conversation, Message

    conversations = (
        session.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .all()
    )
    conversation_data = []
    for conversation in conversations:
        messages = (
            session.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .order_by(Message.created_at)
            .all()
        )
        message_data = []
        for message in messages:
            message_data.append(
                {
                    "id": message.id,
                    "text": message.text,
                    "sender": message.sender,
                    "created_at": message.created_at,
                    "attachments": [
                        {
                            "id": attachment.id,
                            "filename": attachment.filename,
                            "mime_type": attachment.mime_type,
                            "size": attachment.size,
                            "url": attachment_url(
                                current_user.id, attachment.stored_path
                            ),
                        }
                        for attachment in message.attachments
                    ],
                }
            )
        conversation_data.append(
            {
                "id": conversation.id,
                "title": conversation.title,
                "created_at": (
                    messages[0].created_at if messages else conversation.updated_at
                ),
                "updated_at": conversation.updated_at,
                "messages": message_data,
            }
        )

    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "avatar_url": (
                attachment_url(current_user.id, current_user.avatar_path)
                if current_user.avatar_path
                else None
            ),
        },
        "exported_at": datetime.now(timezone.utc),
        "conversations": conversation_data,
    }


@app.post("/api/chat")
def chat_with_ai(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
    input: Annotated[str, Form()] = "",
    is_new: Annotated[bool, Form()] = True,
    conversation_id: Annotated[str | None, Form()] = None,
    persist: Annotated[bool, Form()] = True,
    history: Annotated[str, Form()] = "",
    files: Annotated[list[UploadFile], File()] = [],
    model: Annotated[str, Form()] = "auto",
    show_thinking: Annotated[bool, Form()] = False,
    _rate: None = Depends(chat_limit),
):
    from app.models.chat import Attachment, Conversation, Message

    # Marks the top of the request so the stream can report what each stage of
    # answering actually cost.
    request_started = perf_counter()

    input_text = " ".join(input.split())[:8000].strip()
    if len(files) > MAX_FILES_PER_MESSAGE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A message can carry at most {MAX_FILES_PER_MESSAGE} files. "
                f"You attached {len(files)}."
            ),
        )
    saved_attachments = [save_upload(current_user.id, upload) for upload in files]

    if not input_text and saved_attachments:
        input_text = (
            f"Describe or summarize the attached file(s): "
            + ", ".join(attachment[2] for attachment in saved_attachments)
            + "."
        )
    if not input_text:
        for upload in files:
            upload.file.close()
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Whether this turn creates the conversation row. A brand-new conversation
    # has no messages and no indexed chunks, so the queries that would read them
    # are pointless round-trips — and on a high-latiness database each one costs
    # over a second. The row itself is not inserted here either: its id is
    # generated client-side, so the INSERT is deferred to the background task.
    conversation_is_new = bool(is_new or conversation_id is None)
    if conversation_is_new:
        if persist:
            conversation = Conversation(
                user_id=current_user.id,
                title=input_text[:50],
            )
        else:
            conversation = None
    else:
        # Authorized from the cached owner id: the row itself is not loaded
        # here anymore, because only the background task needs it.
        owner_id = _conversation_owner_id(session, conversation_id)
        conversation = None
        if owner_id is None:
            if persist:
                for upload in files:
                    upload.file.close()
                raise HTTPException(status_code=404, detail="Conversation not found")
        elif owner_id != current_user.id:
            for upload in files:
                upload.file.close()
            raise HTTPException(status_code=404, detail="Conversation not found")

    # The client renders the transcript, so it already holds the exact turns a
    # conversation consists of. Sending them along lets an ongoing turn skip
    # the history SELECT — a full database round-trip — entirely. Persisted
    # state never reads from it: both messages of the turn are stored from the
    # request itself, and the history is only prompt context for the model.
    client_history: list[tuple[str, str]] | None = None
    if history.strip():
        try:
            parsed_history = json.loads(history)
            if isinstance(parsed_history, list):
                parsed_turns = [
                    (str(item.get("sender", "")), str(item.get("text", "")))
                    for item in parsed_history
                    if isinstance(item, dict)
                ]
                client_history = parsed_turns or None
        except (ValueError, TypeError):
            client_history = None

    history_list: list[tuple[str, str]] = []
    if not conversation_is_new:
        if client_history is not None:
            history_list = _trim_history(client_history)
        else:
            # Older clients do not send history: fall back to loading the newest
            # turns from the database (never the whole transcript, which made
            # long chats slower to answer).
            started = perf_counter()
            recent_messages = (
                session.query(Message)
                .filter(Message.conversation_id == conversation_id)
                .order_by(Message.created_at.desc())
                .limit(HISTORY_MAX_MESSAGES)
                .all()
            )
            print(
                f"[db] history fallback {round((perf_counter() - started) * 1000)}ms"
            )
            history_list = _trim_history(
                [
                    (message.sender, message.text)
                    for message in reversed(recent_messages)
                ]
            )
    elif client_history is not None:
        # Temporary chats persist nothing, so the client's copy is the history.
        history_list = _trim_history(client_history)

    if conversation is not None:
        response_conversation_id = conversation.id
    elif conversation_id is not None:
        response_conversation_id = conversation_id
    else:
        response_conversation_id = (
            f"tmp-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        )

    attachment_meta = [
        {
            "id": attachment_id,
            "generated_name": generated_name,
            "filename": filename,
            "mime_type": mime_type,
            "size": size,
            "data": data,
        }
        for attachment_id, generated_name, filename, mime_type, size, data in saved_attachments
    ]
    ai_parts = build_ai_parts(attachment_meta, current_user.id)
    start_attachments = [
        {
            "id": meta["id"],
            "filename": meta["filename"],
            "mime_type": meta["mime_type"],
            "size": meta["size"],
            "url": attachment_url(current_user.id, meta["generated_name"]),
        }
        for meta in attachment_meta
    ]

    from app.services import rag
    from app.services.search_grounding import search_web, should_search

    profile = resolve_model(model or "auto", input_text, bool(ai_parts))
    model_label = profile.label

    # Index text uploads so future turns can be grounded in them (best-effort).
    # An ongoing turn has a stored conversation to index against even though
    # its row is no longer loaded here.
    rag_enabled = rag.is_enabled() and persist and (
        conversation is not None if conversation_is_new else conversation_id is not None
    )
    paragraph_texts: list[dict] = []
    if rag_enabled:
        from app.services.uploads import is_text_like

        for meta in attachment_meta:
            if not is_text_like(meta["mime_type"]):
                continue
            # Reuse the bytes already read at upload time rather than opening
            # the stored file again; this is the third consumer of the same data.
            data = meta.get("data")
            if not data:
                continue
            try:
                content = data.decode("utf-8")
            except UnicodeDecodeError:
                content = None
            if content and content.strip():
                paragraph_texts.append(
                    {
                        "attachment_id": meta["id"],
                        "filename": meta["filename"],
                        "content": content,
                    }
                )

    # Ground the current turn: web search for factual/current questions, RAG
    # over previously uploaded files in this conversation. A new conversation
    # cannot have indexed chunks yet (its uploads are inlined directly and only
    # indexed after the turn), so retrieval — and its existence query — are
    # skipped, saving a database round-trip on the first message.
    rag_conversation_id = (
        conversation_id
        if rag.is_enabled()
        and not conversation_is_new
        and conversation_id
        and rag.has_documents(session, current_user.id, conversation_id)
        else None
    )

    # The three side tasks of a turn share one pool and are all started here,
    # before the response is even opened: they are independent network
    # round-trips, and queueing them serially added their latencies together.
    # Only grounding is awaited before the model call — the title is a
    # decoration and must never delay the first answer token.
    pipeline = ThreadPoolExecutor(max_workers=3)

    # The generator fills this with the finished answer text; the background
    # task reads it to persist the turn after the stream has closed. Sharing it
    # through a holder keeps the multi-second write off the user's critical path.
    stream_state: dict[str, str] = {"response": ""}

    title_future = (
        pipeline.submit(generate_title, input_text, history_list)
        if persist and conversation is not None and (is_new or conversation_id is None)
        else None
    )
    search_future = (
        pipeline.submit(search_web, input_text[:300])
        if should_search(input_text)
        else None
    )
    rag_future = (
        pipeline.submit(
            rag.retrieve_context,
            session,
            current_user.id,
            rag_conversation_id,
            input_text,
        )
        if rag_conversation_id is not None
        else None
    )

    def gather_grounding() -> tuple[list[dict] | None, str]:
        """Collect the web and file context started above."""
        web: list[dict] | None = None
        context = ""
        if search_future is not None:
            try:
                web = search_future.result()
            except Exception:
                web = None
        if rag_future is not None:
            try:
                context = rag_future.result()
            except Exception:
                context = ""
        return web, context

    def stream_response():
        fallback_title = input_text[:50]
        announced_stage: str | None = None

        def emit_stage(name: str) -> str | None:
            """Report what the turn is doing, once per stage.

            The model announces its own thinking step and we announce it before
            the call is even issued; repeating the label would only flicker.
            """
            nonlocal announced_stage
            if name == announced_stage:
                return None
            announced_stage = name
            return json.dumps(
                {"type": "stage", "stage": name, "label": CHAT_STAGES.get(name, name)}
            ) + "\n"

        yield json.dumps(
            {
                "type": "start",
                "conversation_id": response_conversation_id,
                "title": fallback_title if is_new or conversation_id is None else None,
                "attachments": start_attachments,
                "model": model_label,
                "show_thinking": show_thinking,
            }
        ) + "\n"

        # Everything before the model was called: uploads, conversation rows,
        # and the wait for the side tasks to be picked up.
        setup_ms = (perf_counter() - request_started) * 1000

        if search_future is not None and rag_future is not None:
            grounding_stage: str | None = "gathering"
        elif search_future is not None:
            grounding_stage = "searching"
        elif rag_future is not None:
            grounding_stage = "reading_files"
        else:
            grounding_stage = None

        if grounding_stage is not None:
            stage_event = emit_stage(grounding_stage)
            if stage_event:
                yield stage_event

        grounding_started = perf_counter()
        web_results, rag_context = gather_grounding()
        grounding_ms = (perf_counter() - grounding_started) * 1000

        title_sent = False

        def emit_title() -> str | None:
            """Resolve the generated title once and return it for the stream.

            It is applied to the in-memory conversation and written by the
            background task; committing it here would put a database round-trip
            on the answer's critical path for something that is only a label.
            """
            nonlocal title_sent
            if title_future is None or title_sent:
                return None
            title_sent = True
            try:
                generated = title_future.result(timeout=TITLE_WAIT_SECONDS)
            except Exception:
                generated = ""
            if not generated or conversation is None:
                return None
            conversation.title = generated
            return generated

        response_parts = []
        first_token_ms = None
        model_started = perf_counter()

        # The model thinks before it shows anything. Naming that wait up front
        # keeps the pause honest — but only while the user is asking to see the
        # reasoning. With thinking off the turn must not announce a "Thinking"
        # step at all, or disabling the switch would appear to do nothing.
        if show_thinking:
            stage_event = emit_stage("thinking")
            if stage_event:
                yield stage_event

        try:
            # One path for every turn. The title used to ride along in this
            # stream, which meant the answer could not surface until the model
            # had thought, written the title markers, and reached the answer.
            for kind, value in stream_message_events(
                input_text,
                history_list,
                ai_parts,
                model_preference=model or "auto",
                web_results=web_results,
                rag_context=rag_context,
                show_thinking=show_thinking,
            ):
                if kind == "stage":
                    stage_event = emit_stage(value)
                    if stage_event:
                        yield stage_event
                elif kind == "thinking":
                    yield json.dumps({"type": "thinking", "text": value}) + "\n"
                else:
                    if first_token_ms is None:
                        first_token_ms = (perf_counter() - model_started) * 1000
                    response_parts.append(value)
                    yield json.dumps({"type": "chunk", "text": value}) + "\n"
                    if title_future is not None and title_future.done():
                        title = emit_title()
                        if title:
                            yield json.dumps({"type": "title", "title": title}) + "\n"
        except Exception as exc:
            print(f"[chat] stream error: {exc}")
            error_detail = (
                str(exc) if exc else "An unexpected error occurred"
            )
            yield json.dumps({"type": "error", "detail": error_detail}) + "\n"

        if title_future is not None:
            title = emit_title()
            if title:
                yield json.dumps({"type": "title", "title": title}) + "\n"

        response = "".join(response_parts)
        # Hand the finished text to the background task, which persists the
        # turn and indexes any uploads. Doing it here instead would keep the
        # client waiting on database writes and Gemini embedding calls after the
        # last token, long past the point the answer is on screen.
        stream_state["response"] = response

        # Where the wait actually went, on every turn: setup and grounding are
        # our own overhead, ttfb is the model thinking before its first token.
        total_ms = (perf_counter() - request_started) * 1000
        timings = {
            "type": "timing",
            "setup_ms": round(setup_ms),
            "grounding_ms": round(grounding_ms),
            "model_ttfb_ms": None if first_token_ms is None else round(first_token_ms),
            "total_ms": round(total_ms),
        }
        print(
            f"[chat] {model_label} | setup {timings['setup_ms']}ms | "
            f"grounding {timings['grounding_ms']}ms | "
            f"ttfb {timings['model_ttfb_ms']}ms | total {timings['total_ms']}ms"
        )
        yield json.dumps(timings) + "\n"
        yield json.dumps({"type": "done"}) + "\n"

    def finalize_turn():
        """Persist the turn and index its uploads after the stream has closed.

        Runs as a background task on a fresh session: the request-scoped one is
        torn down by FastAPI before background tasks fire, and reusing it would
        write through a closed connection. A brand-new conversation row is
        inserted here too — its id was generated client-side, so the answer never
        waited on that INSERT. Everything is one transaction on one connection.
        Best-effort: a failure is logged and never reaches the finished response.
        """
        if not persist:
            return
        response = stream_state["response"]
        try:
            with Session(engine) as bg_session:
                if conversation_is_new:
                    if conversation is None:
                        return
                    managed = conversation
                    bg_session.add(managed)
                else:
                    managed = bg_session.get(Conversation, conversation_id)
                    if managed is None:
                        return

                user_message = Message(
                    conversation_id=managed.id,
                    text=input_text,
                    sender="user",
                )
                bg_session.add(user_message)
                # Flush so the user row exists before its attachments reference it.
                bg_session.flush()

                for meta in attachment_meta:
                    bg_session.add(
                        Attachment(
                            message_id=user_message.id,
                            filename=meta["filename"],
                            mime_type=meta["mime_type"],
                            size=meta["size"],
                            stored_path=meta["generated_name"],
                        )
                    )

                bg_session.add(
                    Message(
                        conversation_id=managed.id, text=response, sender="ai"
                    )
                )
                managed.updated_at = datetime.now(timezone.utc)
                bg_session.commit()

                if paragraph_texts:
                    rag.index_attachments(
                        bg_session,
                        current_user.id,
                        managed.id,
                        paragraph_texts,
                    )
        except Exception as exc:
            print(f"[chat] persist/index failed: {exc}")

    def close_pipeline():
        # Runs once the response is finished or abandoned. The side tasks are
        # either done or no longer wanted by now, so a title call that hung
        # must not hold the pool (or the response) open.
        pipeline.shutdown(wait=False)

    def finalize_and_close():
        # Persist the turn first, then release the pool, so the side tasks are
        # shut down only once nothing still needs their results.
        finalize_turn()
        close_pipeline()

    return StreamingResponse(
        stream_response(),
        media_type="application/x-ndjson",
        headers={
            # Keep reverse proxies from buffering the tokens: without this the
            # whole answer can arrive at once when the stream finally closes.
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
        background=BackgroundTask(finalize_and_close),
    )


# A route for fetching conversations for the current user.
#
# This is the first thing the chat page asks for, so it stays cheap: one query
# for the page of conversations and one grouped query for their message
# stats, with no message bodies. Transcripts used to be loaded here — one query
# per conversation plus one per message for attachments — which made this
# response grow with the age of the account and slowed every visit.
@app.get("/api/conversations")
def get_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
    limit: Annotated[int, Query(ge=1, le=CONVERSATIONS_PAGE_MAX)] = CONVERSATIONS_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    from app.models.chat import Conversation, Message

    total = (
        session.query(func.count(Conversation.id))
        .filter(Conversation.user_id == current_user.id)
        .scalar()
    ) or 0

    conversations = (
        session.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    conversation_ids = [conversation.id for conversation in conversations]

    stats: dict[str, tuple[int, datetime | None]] = {}
    if conversation_ids:
        stats = {
            row.conversation_id: (row.total, row.first_at)
            for row in (
                session.query(
                    Message.conversation_id,
                    func.count(Message.id).label("total"),
                    func.min(Message.created_at).label("first_at"),
                )
                .filter(Message.conversation_id.in_(conversation_ids))
                .group_by(Message.conversation_id)
                .all()
            )
        }

    conversation_data = [
        {
            "id": conversation.id,
            "title": conversation.title,
            # The UI sorts by "time created", which means the first exchange,
            # not the row's insert time.
            "created_at": stats.get(conversation.id, (0, None))[1]
            or conversation.updated_at,
            "updated_at": conversation.updated_at,
            "message_count": stats.get(conversation.id, (0, None))[0],
        }
        for conversation in conversations
    ]

    return {
        "conversations": conversation_data,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(conversation_data) < total,
    }


# Activity totals for the profile page. Aggregated in the database so the
# profile no longer has to download every message just to count them.
@app.get("/api/stats")
def get_activity_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Conversation, Message

    def user_messages(*filters):
        return (
            session.query(func.count(Message.id))
            .join(Conversation, Message.conversation_id == Conversation.id)
            .filter(Conversation.user_id == current_user.id, *filters)
            .scalar()
        ) or 0

    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    return {
        "conversations": (
            session.query(func.count(Conversation.id))
            .filter(Conversation.user_id == current_user.id)
            .scalar()
        ) or 0,
        "messages": user_messages(),
        "user_messages": user_messages(Message.sender == "user"),
        "month_user_messages": user_messages(
            Message.sender == "user", Message.created_at >= month_start
        ),
    }


# Messages for a single conversation. The chat page loads these only when a
# conversation is actually opened, which keeps first paint off the transcript.
@app.get("/api/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
    limit: Annotated[int, Query(ge=1, le=MESSAGE_PAGE_MAX)] = MESSAGE_PAGE_SIZE,
):
    from app.models.chat import Attachment, Conversation, Message

    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Newest turns first: if a transcript is longer than the page, the part the
    # user needs to see (and keep in context) is the tail, not the head.
    # One extra row is fetched purely so "is there more" is exact.
    recent_messages = list(
        reversed(
            session.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(limit + 1)
            .all()
        )
    )
    has_more_older = len(recent_messages) > limit
    if has_more_older:
        recent_messages = recent_messages[1:]
    message_ids = [message.id for message in recent_messages]

    attachments_by_message: dict[str, list[dict]] = {}
    if message_ids:
        for attachment in (
            session.query(Attachment)
            .filter(Attachment.message_id.in_(message_ids))
            .order_by(Attachment.created_at)
            .all()
        ):
            attachments_by_message.setdefault(attachment.message_id, []).append(
                {
                    "id": attachment.id,
                    "filename": attachment.filename,
                    "mime_type": attachment.mime_type,
                    "size": attachment.size,
                    "url": attachment_url(current_user.id, attachment.stored_path),
                }
            )

    return {
        "conversation_id": conversation.id,
        "title": conversation.title,
        "updated_at": conversation.updated_at,
        "messages": [
            {
                "id": message.id,
                "text": message.text,
                "sender": message.sender,
                "created_at": message.created_at,
                "attachments": attachments_by_message.get(message.id, []),
            }
            for message in recent_messages
        ],
        "has_more_older": has_more_older,
    }


@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Attachment, Conversation, Message

    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    stored_paths = []
    for message in (
        session.query(Message).filter(Message.conversation_id == conversation.id).all()
    ):
        for attachment in message.attachments:
            stored_paths.append(attachment.stored_path)

    session.delete(conversation)
    session.commit()
    _conversation_owner.delete(conversation_id)

    for stored_path in stored_paths:
        target = UPLOADS_DIR / current_user.id / stored_path
        target.unlink(missing_ok=True)

    from app.services import rag

    if rag.is_enabled():
        rag.delete_conversation_chunks(engine, [conversation.id])
    return {"message": "Conversation was deleted successfully."}


@app.post("/api/conversations/bulk-delete")
def bulk_delete_conversations(
    request: ConversationBulkDeleteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Attachment, Conversation, Message

    conversation_ids = request.conversation_ids
    if not conversation_ids:
        raise HTTPException(status_code=400, detail="No conversation ids provided")

    conversations = (
        session.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id,
            Conversation.id.in_(conversation_ids),
        )
        .all()
    )
    if not conversations:
        raise HTTPException(status_code=404, detail="No matching conversations found")

    conversation_ids_found = [c.id for c in conversations]
    stored_paths = []
    messages = (
        session.query(Message)
        .filter(Message.conversation_id.in_(conversation_ids_found))
        .all()
    )
    for message in messages:
        for attachment in message.attachments:
            stored_paths.append(attachment.stored_path)

    for conversation in conversations:
        session.delete(conversation)
    session.commit()
    for conversation_id_found in conversation_ids_found:
        _conversation_owner.delete(conversation_id_found)

    for stored_path in stored_paths:
        target = UPLOADS_DIR / current_user.id / stored_path
        target.unlink(missing_ok=True)

    from app.services import rag

    if rag.is_enabled():
        rag.delete_conversation_chunks(engine, conversation_ids_found)

    return {
        "message": f"{len(conversations)} conversation(s) deleted successfully.",
        "deleted": len(conversations),
    }


@app.put("/api/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: str,
    rename_request: Rename_request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Conversation

    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    new_title = " ".join(rename_request.title.split())[:50].strip()
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    conversation.title = new_title
    conversation.updated_at = datetime.now(timezone.utc)
    session.add(conversation)
    session.commit()
    return {"message": "Conversation was renamed successfully.", "title": new_title}
