import os

from sqlmodel import SQLModel, create_engine

from app.models.chat import Attachment, Conversation, Message
from app.models.user import User

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
