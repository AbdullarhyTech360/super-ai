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
#    minutes apart.
# pool_pre_ping used to be the safety net for a dead connection, but it costs
# a full database round-trip on every pool checkout — on a distant Postgres
# that is hundreds of milliseconds added to every request. With keepalives
# owning idle-connection health it is off by default; set DB_POOL_PRE_PING=true
# to restore the extra caution (a stale connection then surfaces as a normal
# request error instead).
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
    pool_pre_ping=os.environ.get("DB_POOL_PRE_PING", "false").lower()
    in ("1", "true", "yes"),
    pool_recycle=int(os.environ.get("DB_POOL_RECYCLE_SECONDS", "1800")),
    pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
    max_overflow=int(os.environ.get("DB_POOL_MAX_OVERFLOW", "10")),
    connect_args=connect_args,
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
