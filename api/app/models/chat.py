from sqlmodel import Field, SQLModel
from app.services.generate_uuid import generate_uuid
from datetime import datetime, timezone

class Message(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(generate_uuid()), primary_key=True)
    conversation_id: str = Field(foreign_key="conversation.id", index=True)
    text: str
    sender: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Conversation(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(generate_uuid()), primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    title: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))