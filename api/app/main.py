from typing import Annotated

from datetime import datetime, timedelta, timezone

import jwt
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from fastapi import Depends, FastAPI, HTTPException
from sqlmodel import Session
from app.db.session import get_session
from app.db.database import create_db_and_tables
from app.models.user import User
from app.models.forms import SignUp, Login
from app.schemas.conversation_role import Chat_role, Rename_request
from app.services.conversation_ai import send_message_stream, send_message_stream_with_title

import os
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
    }

@app.post("/api/chat")
def chat_with_ai(
    chat_model: Chat_role,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Conversation, Message

    if chat_model.is_new or chat_model.conversation_id is None:
        new_conversation = Conversation(
            user_id=current_user.id,
            title=chat_model.input[:50],
        )
        session.add(new_conversation)
        session.commit()
        session.refresh(new_conversation)
        conversation = new_conversation
    else:
        conversation = session.get(Conversation, chat_model.conversation_id)
        if conversation is None or conversation.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Conversation not found")

    history = [
        (message.sender, message.text)
        for message in session.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at)
        .all()
    ]
    conversation_id = conversation.id

    def stream_response():
        import json
        fallback_title = " ".join(chat_model.input.split())[:50].strip()

        yield json.dumps({
            "type": "start",
            "conversation_id": conversation_id,
            "title": fallback_title if chat_model.is_new or chat_model.conversation_id is None else None,
        }) + "\n"

        response_parts = []
        if chat_model.is_new or chat_model.conversation_id is None:
            stream = send_message_stream_with_title(chat_model.input, history)
            title = ""
            for event_type, value in stream:
                if event_type == "title":
                    title = " ".join(value.split())[:50].strip()
                    if not title:
                        title = " ".join(chat_model.input.split())[:50].strip()
                    conversation.title = title
                    session.add(conversation)
                    session.commit()
                    yield json.dumps({"type": "title", "title": title}) + "\n"
                else:
                    response_parts.append(value)
                    yield json.dumps({"type": "chunk", "text": value}) + "\n"
        else:
            for chunk in send_message_stream(chat_model.input, history):
                response_parts.append(chunk)
                yield json.dumps({"type": "chunk", "text": chunk}) + "\n"

        response = "".join(response_parts)
        session.add_all([
            Message(conversation_id=conversation_id, text=chat_model.input, sender="user"),
            Message(conversation_id=conversation_id, text=response, sender="ai"),
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
            "messages": messages,
        })

    return {"conversations": conversation_data}

@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    session: sessionDep,
):
    from app.models.chat import Conversation

    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    session.delete(conversation)
    session.commit()
    return {"message": "Conversation was deleted successfully."}

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