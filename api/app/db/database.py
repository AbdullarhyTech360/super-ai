from pathlib import Path

from sqlmodel import SQLModel, create_engine
from sqlalchemy import inspect, text
from app.models.chat import Attachment, Conversation, Message

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'super_ai.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


def _run_lightweight_migrations() -> None:
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("user")}
    # SQLModel's create_all doesn't add columns to existing tables, so
    # backfill schema changes made after the table was first created.
    if "avatar_path" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE user ADD COLUMN avatar_path VARCHAR")
            )


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _run_lightweight_migrations()