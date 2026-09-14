from typing import Annotated

from datetime import datetime, timedelta, timezone

import jwt
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from sqlmodel import Session
from app.db.session import get_session
from app.db.database import create_db_and_tables
from app.models.user import User
from app.models.forms import SignUp, Login
from app.schemas.conversation_role import Rename_request, ConversationBulkDeleteRequest
from app.schemas.user import ChangePasswordRequest, ProfileUpdate
from app.services.conversation_ai import send_message_stream, send_message_stream_with_title
from app.services.uploads import (
    IMAGE_TYPES,
    UPLOADS_DIR,
    attachment_url,
    build_ai_parts,
    save_image_upload,
    save_upload,
)

import os
import json
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.environ.get("SECRET_KEY", "your_secret_key_here")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/user")

password_hash = PasswordHash.recommended()

app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:8080",
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

def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], session: Session = Depends(get_session)) -> User:
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

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

@app.on_event("startup")
def startup_event():
    # Perform any startup tasks here, such as initializing resources or connections
    print("Starting up the application...")
    create_db_and_tables()

# Create a route to create a new user
@app.post("/api/auth/signup")
def create_user(user_data: SignUp, session: sessionDep):
    # First check if the user already exists in the database using the provided email
    existing_user = session.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=password_hash.hash(user_data.password)
    )
    # If the user does not exist, add the new user to the database

    session.add(new_user)
    session.commit()
    session.refresh(new_user)  # Refresh the user instance to get the generated ID
    return {"message": "User created successfully", "user_id": new_user.id}

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
    if not verify_password(change_request.current_password, current_user.hashed_password):
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
            message_data.append({
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
                        "url": attachment_url(current_user.id, attachment.stored_path),
                    }
                    for attachment in message.attachments
                ],
            })
        conversation_data.append({
            "id": conversation.id,
            "title": conversation.title,
            "created_at": messages[0].created_at if messages else conversation.updated_at,
            "updated_at": conversation.updated_at,
            "messages": message_data,
        })

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
):
    from app.models.chat import Attachment, Conversation, Message

    input_text = " ".join(input.split())[:8000].strip()
    saved_attachments = [
        save_upload(current_user.id, upload) for upload in files
    ]

    if not input_text and saved_attachments:
        input_text = (
            f"Describe or summarize the attached file(s): "
            + ", ".join(attachment[2] for attachment in saved_attachments) + "."
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
        history_list = [
            (message.sender, message.text)
            for message in session.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .order_by(Message.created_at)
            .all()
        ]
    elif history.strip():
        try:
            parsed_history = json.loads(history)
            history_list = [
                (item.get("sender", ""), item.get("text", ""))
                for item in parsed_history
                if isinstance(item, dict)
            ][-40:]
        except (ValueError, TypeError):
            history_list = []

    if conversation is not None:
        response_conversation_id = conversation.id
    elif conversation_id is not None:
        response_conversation_id = conversation_id
    else:
        response_conversation_id = f"tmp-{int(datetime.now(timezone.utc).timestamp() * 1000)}"

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

    def stream_response():
        import json
        fallback_title = input_text[:50]

        yield json.dumps({
            "type": "start",
            "conversation_id": response_conversation_id,
            "title": fallback_title if is_new or conversation_id is None else None,
            "attachments": start_attachments,
        }) + "\n"

        response_parts = []
        if is_new or conversation_id is None:
            if persist and conversation is not None:
                stream = send_message_stream_with_title(input_text, history_list, ai_parts)
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
                for chunk in send_message_stream(input_text, history_list, ai_parts):
                    response_parts.append(chunk)
                    yield json.dumps({"type": "chunk", "text": chunk}) + "\n"
        else:
            for chunk in send_message_stream(input_text, history_list, ai_parts):
                response_parts.append(chunk)
                yield json.dumps({"type": "chunk", "text": chunk}) + "\n"

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
                session.add(Attachment(
                    message_id=user_message.id,
                    filename=meta["filename"],
                    mime_type=meta["mime_type"],
                    size=meta["size"],
                    stored_path=meta["generated_name"],
                ))

            session.add_all([
                Message(conversation_id=conversation.id, text=response, sender="ai"),
            ])
            conversation.updated_at = datetime.now(timezone.utc)
            session.add(conversation)
            session.commit()
        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(
        stream_response(),
        media_type="application/x-ndjson",
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
        conversation_data.append({
            "id": conversation.id,
            "title": conversation.title,
            "created_at": messages[0].created_at if messages else conversation.updated_at,
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
        })

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
    for message in session.query(Message).filter(
        Message.conversation_id == conversation.id
    ).all():
        for attachment in message.attachments:
            stored_paths.append(attachment.stored_path)

    session.delete(conversation)
    session.commit()

    for stored_path in stored_paths:
        target = UPLOADS_DIR / current_user.id / stored_path
        target.unlink(missing_ok=True)
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