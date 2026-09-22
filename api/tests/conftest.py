"""Test bootstrap.

`app.main` builds its database engine at import time. Nothing here connects —
`create_engine` is lazy — but the module refuses to import without a
DATABASE_URL, so a dummy Postgres URL keeps the suite runnable on a clean
checkout that has no `api/.env`. `load_dotenv` never overrides a variable that
is already set, so these values win over a real local `.env`.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg2://test:test@127.0.0.1:5432/test"
)
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("EMAIL_PROVIDER", "console")
os.environ.setdefault("RATE_LIMIT_ENABLED", "true")
os.environ.setdefault("RATE_LIMIT_TRUST_PROXY", "true")
