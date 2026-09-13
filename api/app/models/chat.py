from sqlmodel import Field, SQLModel, Relationship
from app.services.generate_uuid import generate_uuid
from datetime import datetime, timezone


class Attachment(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(generate_uuid()), primary_key=True)
    message_id: str = Field(foreign_key="message.id", index=True)
    filename: str
    mime_type: str
    size: int
    stored_path: str
    message: "Message" = Relationship(back_populates="attachments")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Message(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(generate_uuid()), primary_key=True)
    conversation_id: str = Field(foreign_key="conversation.id", index=True)
    text: str
    sender: str
    conversation: "Conversation" = Relationship(back_populates="messages")
    attachments: list[Attachment] = Relationship(back_populates="message", cascade_delete=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


Attachment.model_rebuild()

class Conversation(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(generate_uuid()), primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    title: str
    messages: list[Message] = Relationship(back_populates="conversation", cascade_delete=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))