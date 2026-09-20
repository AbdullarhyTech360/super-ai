import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from sqlmodel import Session

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
    resolve_model,
    send_message_stream,
    send_message_stream_with_title,
)
from app.services.email import send_verification_email
from app.services.uploads import (
    IMAGE_TYPES,
    UPLOADS_DIR,
    attachment_url,
    build_ai_parts,
    save_image_upload,
    save_upload,
)

SECRET_KEY = os.environ.get("SECRET_KEY", "your_secret_key_here")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
RESET_TOKEN_EXPIRE_MINUTES = int(os.environ.get("RESET_TOKEN_EXPIRE_MINUTES", "30"))
VERIFY_TOKEN_EXPIRE_MINUTES = int(os.environ.get("VERIFY_TOKEN_EXPIRE_MINUTES", "30"))
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000")

# Every turn re-sends the conversation history to the model, so it is capped:
# an unbounded transcript makes each answer slower than the last.
HISTORY_MAX_MESSAGES = int(os.environ.get("CHAT_HISTORY_MAX_MESSAGES", "20"))
HISTORY_MAX_CHARS = int(os.environ.get("CHAT_HISTORY_MAX_CHARS", "12000"))

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

    user = session.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


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
def create_user(user_data: SignUp, session: sessionDep):
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
def resend_verification(resend_request: ResendVerificationRequest, session: sessionDep):
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
def authenticate_user_route(form_data: Login, session: sessionDep):
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
def forgot_password(forgot_request: ForgotPasswordRequest, session: sessionDep):
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
        # TODO: Replace with real email delivery when the email service is
        # configured during deployment. Until then, the link is logged to the
        # server console for local development.
        print(f"[password_reset] Reset link for {user.email}: {reset_url}")

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

    current_user.full_name = full_name
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
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


@app.delete("/api/me")
def delete_current_user_account(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    import shutil

    from app.models.chat import Conversation, Message

    conversations = (
        session.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
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

    session.delete(current_user)
    session.commit()

    # Remove the account's stored files from disk (chat attachments + avatar).
    for stored_path in stored_paths:
        target = UPLOADS_DIR / current_user.id / stored_path
        target.unlink(missing_ok=True)
    shutil.rmtree(UPLOADS_DIR / current_user.id, ignore_errors=True)

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
    current_user.avatar_path = avatar_path
    session.add(current_user)
    session.commit()

    if old_path:
        (UPLOADS_DIR / current_user.id / old_path).unlink(missing_ok=True)

    return {"avatar_url": attachment_url(current_user.id, avatar_path)}


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

    current_user.hashed_password = password_hash.hash(new_password)
    session.add(current_user)
    session.commit()
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
):
    from app.models.chat import Attachment, Conversation, Message

    input_text = " ".join(input.split())[:8000].strip()
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

    if is_new or conversation_id is None:
        if persist:
            new_conversation = Conversation(
                user_id=current_user.id,
                title=input_text[:50],
            )
            session.add(new_conversation)
            session.commit()
            session.refresh(new_conversation)
            conversation = new_conversation
        else:
            conversation = None
    else:
        conversation = session.get(Conversation, conversation_id)
        if conversation is None:
            if persist:
                for upload in files:
                    upload.file.close()
                raise HTTPException(status_code=404, detail="Conversation not found")
        elif conversation.user_id != current_user.id:
            for upload in files:
                upload.file.close()
            raise HTTPException(status_code=404, detail="Conversation not found")

    history_list: list[tuple[str, str]] = []
    if conversation is not None:
        # Only the newest turns are loaded: the whole transcript is never
        # needed, and fetching it made long chats slower to answer.
        recent_messages = (
            session.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc())
            .limit(HISTORY_MAX_MESSAGES)
            .all()
        )
        history_list = _trim_history(
            [
                (message.sender, message.text)
                for message in reversed(recent_messages)
            ]
        )
    elif history.strip():
        try:
            parsed_history = json.loads(history)
            history_list = _trim_history(
                [
                    (item.get("sender", ""), item.get("text", ""))
                    for item in parsed_history
                    if isinstance(item, dict)
                ]
            )
        except (ValueError, TypeError):
            history_list = []

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
        }
        for attachment_id, generated_name, filename, mime_type, size in saved_attachments
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
    rag_enabled = rag.is_enabled() and persist and conversation is not None
    paragraph_texts: list[dict] = []
    if rag_enabled:
        from app.services.uploads import is_text_like

        for meta in attachment_meta:
            if not is_text_like(meta["mime_type"]):
                continue
            path = UPLOADS_DIR / current_user.id / meta["generated_name"]
            if not path.exists():
                continue
            try:
                content = path.read_text(encoding="utf-8")
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
    # over previously uploaded files in this conversation. Resolved lazily
    # inside the stream generator (see below) so the response opens first.
    rag_conversation_id = (
        conversation.id
        if rag.is_enabled() and conversation is not None
        else None
    )

    def gather_grounding() -> tuple[list[dict] | None, str]:
        """Fetch web and file grounding concurrently.

        Both lookups are independent network round-trips, so running them
        together costs one wait instead of two added to every answer.
        """
        from concurrent.futures import ThreadPoolExecutor

        web: list[dict] | None = None
        context = ""
        with ThreadPoolExecutor(max_workers=2) as pool:
            search_future = (
                pool.submit(search_web, input_text[:300])
                if should_search(input_text)
                else None
            )
            rag_future = (
                pool.submit(
                    rag.retrieve_context,
                    session,
                    current_user.id,
                    rag_conversation_id,
                    input_text,
                )
                if rag_conversation_id is not None
                else None
            )
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
        import json

        fallback_title = input_text[:50]

        yield json.dumps(
            {
                "type": "start",
                "conversation_id": response_conversation_id,
                "title": fallback_title if is_new or conversation_id is None else None,
                "attachments": start_attachments,
                "model": model_label,
            }
        ) + "\n"

        web_results, rag_context = gather_grounding()

        response_parts = []
        try:
            if is_new or conversation_id is None:
                if persist and conversation is not None:
                    stream = send_message_stream_with_title(
                        input_text,
                        history_list,
                        ai_parts,
                        model_preference=model or "auto",
                        web_results=web_results,
                        rag_context=rag_context,
                    )
                    title = ""
                    for event_type, value in stream:
                        if event_type == "title":
                            title = " ".join(value.split())[:50].strip()
                            if not title:
                                title = input_text[:50]
                            conversation.title = title
                            session.add(conversation)
                            session.commit()
                            yield json.dumps({"type": "title", "title": title}) + "\n"
                        else:
                            response_parts.append(value)
                            yield json.dumps({"type": "chunk", "text": value}) + "\n"
                else:
                    for chunk in send_message_stream(
                        input_text,
                        history_list,
                        ai_parts,
                        model_preference=model or "auto",
                        web_results=web_results,
                        rag_context=rag_context,
                    ):
                        response_parts.append(chunk)
                        yield json.dumps({"type": "chunk", "text": chunk}) + "\n"
            else:
                for chunk in send_message_stream(
                    input_text,
                    history_list,
                    ai_parts,
                    model_preference=model or "auto",
                    web_results=web_results,
                    rag_context=rag_context,
                ):
                    response_parts.append(chunk)
                    yield json.dumps({"type": "chunk", "text": chunk}) + "\n"
        except Exception as exc:
            print(f"[chat] stream error: {exc}")
            error_detail = (
                str(exc) if exc else "An unexpected error occurred"
            )
            yield json.dumps({"type": "error", "detail": error_detail}) + "\n"

        response = "".join(response_parts)

        if persist and conversation is not None:
            user_message = Message(
                conversation_id=conversation.id,
                text=input_text,
                sender="user",
            )
            session.add(user_message)
            session.commit()
            session.refresh(user_message)

            for meta in attachment_meta:
                session.add(
                    Attachment(
                        message_id=user_message.id,
                        filename=meta["filename"],
                        mime_type=meta["mime_type"],
                        size=meta["size"],
                        stored_path=meta["generated_name"],
                    )
                )

            session.add_all(
                [
                    Message(
                        conversation_id=conversation.id, text=response, sender="ai"
                    ),
                ]
            )
            conversation.updated_at = datetime.now(timezone.utc)
            session.add(conversation)
            session.commit()

            if paragraph_texts:
                rag.index_attachments(
                    session,
                    current_user.id,
                    conversation.id,
                    paragraph_texts,
                )
        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(
        stream_response(),
        media_type="application/x-ndjson",
        headers={
            # Keep reverse proxies from buffering the tokens: without this the
            # whole answer can arrive at once when the stream finally closes.
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


# A route for fetching conversations for the current user
@app.get("/api/conversations")
def get_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Conversation, Message

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
        conversation_data.append(
            {
                "id": conversation.id,
                "title": conversation.title,
                "created_at": (
                    messages[0].created_at if messages else conversation.updated_at
                ),
                "updated_at": conversation.updated_at,
                "messages": [
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
                    for message in messages
                ],
            }
        )

    return {"conversations": conversation_data}


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
