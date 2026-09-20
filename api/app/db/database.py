import os

from sqlmodel import SQLModel, create_engine

from app.models.chat import Attachment, Conversation, Message
from app.models.user import User

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

# Managed Postgres (e.g. Supabase) requires TLS; a local dev database does not
# and fails with sslmode=require. Set DB_SSLMODE=require in production.
sslmode = os.environ.get("DB_SSLMODE", "disable")
connect_args = {"sslmode": sslmode} if sslmode != "disable" else {}

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=connect_args,
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
