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

# A cold connection to a distant Postgres costs seconds (its TCP + TLS + auth
# handshake crosses the whole network round-trip several times over), so the
# pool is configured to reuse connections rather than re-establish them:
#  - TCP keepalives stop NAT/idle timeouts from silently dropping an idle
#    socket, which is what otherwise forces the next request to reconnect.
#  - A long recycle interval keeps a connection warm across messages spaced
#    minutes apart; pool_pre_ping still catches one that died anyway and
#    replaces it, so correctness is kept without frequent reconnects.
connect_args.update(
    {
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=int(os.environ.get("DB_POOL_RECYCLE_SECONDS", "1800")),
    pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
    max_overflow=int(os.environ.get("DB_POOL_MAX_OVERFLOW", "10")),
    connect_args=connect_args,
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
