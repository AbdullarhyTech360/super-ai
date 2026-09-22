# Super-AI API

The FastAPI backend for [Super-AI](../README.md): account handling, conversation storage, and the streaming Gemini layer that grounds answers in web search and in the user's own uploaded files.

## Requirements

- **Python 3.13.** `pyproject.toml` pins `requires-python = "==3.13.*"`; the container image is `python:3.13-slim`.
- **PDM** — `pip install pdm` (or `pipx install pdm`).
- **PostgreSQL 16 with the pgvector extension.** Required, not optional: `DATABASE_URL` must be set or startup raises, and RAG storage uses vector columns.

## Getting Started

```bash
cd api
pdm install
pdm run uvicorn app.main:app --reload --port 8000
```

- API: http://127.0.0.1:8000
- Interactive docs: http://127.0.0.1:8000/docs

Create `api/.env` first (it is git-ignored and is not in the repository, so there is no example file to copy) and fill in the variables below. `app/main.py` loads it through `load_dotenv()` at import time.

> **Windows note:** the uvicorn reloader has been observed to leave a wedged process behind. If a code change does not take effect, kill the server and start it again without `--reload`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — (**required**) | `postgresql+psycopg2://user:pass@host:5432/db` |
| `DB_SSLMODE` | `disable` | Set to `require` for managed Postgres such as Supabase |
| `GEMINI_API_KEY` | placeholder | Chat, vision, titles, embeddings |
| `SECRET_KEY` | placeholder | JWT signing — must be replaced |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | Session token lifetime (7 days) |
| `VERIFY_TOKEN_EXPIRE_MINUTES` | `30` | Email verification link |
| `RESET_TOKEN_EXPIRE_MINUTES` | `30` | Password reset link |
| `CORS_ORIGINS` | localhost 3000/8080 | Comma-separated allow-list |
| `FRONTEND_BASE_URL` | `http://localhost:3000` | Base for links inside emails |
| `EMAIL_PROVIDER` | `console` | `resend`, SMTP, or `console` (prints instead of sending) |
| `EMAIL_FROM` | Super AI no-reply | Sender address |
| `RESEND_API_KEY` | empty | Needed for real delivery; Resend requires a real `User-Agent`, which the service sets |
| `SERPER_API_KEY` | empty | Web-search grounding. Without it the feature is inert |
| `SERPER_GL` / `SERPER_HL` | — | Search region and language |
| `RAG_ENABLED` | `true` | Retrieval over uploaded text files |
| `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | `gemini-embedding-001` / `1536` | Embedding configuration |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` / `RAG_MAX_CHUNKS_PER_FILE` / `RAG_MAX_RESULTS` | `1200` / `150` / `60` / `6` | Chunking and retrieval |
| `CHAT_HISTORY_MAX_MESSAGES` / `CHAT_HISTORY_MAX_CHARS` | `20` / `12000` | How much transcript is re-sent per turn |
| `CHAT_TITLE_WAIT_SECONDS` | `10` | Cap on waiting for a generated title |
| `CHAT_LIST_PAGE_SIZE` / `CHAT_MESSAGE_PAGE_SIZE` (and `_MAX` variants) | `50` / `200` | Pagination limits |
| `GEMINI_MODEL_LITE` / `_BALANCED` / `_PRO` / `_TITLE` | flash-lite / flash / flash / flash-lite | Model per tier |
| `GEMINI_LITE_THINKING` / `_BALANCED_` / `_PRO_` / `_TITLE_THINKING` | `low` / `low` / `medium` / `low` | Reasoning budget per tier |
| `TITLE_MAX_OUTPUT_TOKENS` / `TITLE_MAX_CHARS` | `128` / `50` | Keep the token budget generous: hidden thinking tokens consume it before the title does |
| `AUTO_LONG_PROMPT_CHARS` / `AUTO_COMPLEX_MIN_CHARS` | `600` / `200` | Thresholds for `auto` model routing |
| `SEARCH_TIMEOUT_SECONDS` / `SEARCH_CACHE_SECONDS` | `1.8` / `120` | Search is blocking, so it is capped and cached |
| `RAG_EMBEDDING_CACHE_SECONDS` | `120` | Query-embedding cache window |

## Project Structure

```
api/
├── app/
│   ├── main.py               # App factory, middleware, and every HTTP route
│   ├── db/
│   │   ├── database.py       # Engine, TLS connect args, create_all
│   │   └── session.py        # Session dependency
│   ├── models/
│   │   ├── user.py           # User: id, name, email, hash, avatar, is_verified
│   │   └── chat.py           # Conversation → Message → Attachment
│   ├── schemas/
│   │   ├── user.py           # Signup/login/profile/password request bodies
│   │   └── conversation_role.py
│   └── services/
│       ├── conversation_ai.py  # Model tiers, prompt, streaming events, titles
│       ├── rag.py              # pgvector chunk storage and similarity retrieval
│       ├── search_grounding.py # Serper search with pooling, timeout, TTL cache
│       ├── uploads.py          # Validation, storage, and multimodal part building
│       ├── email.py            # Resend / SMTP / console delivery
│       ├── ttl_cache.py        # Small shared time-boxed cache
│       └── generate_uuid.py
├── data/
│   └── uploads/              # Per-user attachment and avatar storage
├── pyproject.toml            # Dependencies, black/isort configuration
├── pdm.lock
└── Dockerfile
```

`app/routers/` exists but is empty: routes are defined directly in `main.py`. Extract a router module before adding a new resource area rather than growing the file further.

## Routes

Public: `GET /`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.

Authenticated (`Authorization: Bearer <token>`): `GET /api/get/user`, `GET|PUT|DELETE /api/me`, `POST /api/me/avatar`, `POST /api/change-password`, `GET /api/export`, `GET /api/stats`, `POST /api/chat`, `GET /api/conversations`, `GET /api/conversations/{id}/messages`, `PUT|DELETE /api/conversations/{id}`, `POST /api/conversations/bulk-delete`.

Static: uploaded files are served from `/uploads`, mounted on `UPLOADS_DIR`.

`POST /api/chat` accepts multipart form fields (`input`, `is_new`, `conversation_id`, `persist`, `history`, `model`, `show_thinking`, and repeated `files`) and responds with `application/x-ndjson` lines: `start`, `stage`, `thinking`, `chunk`, `title`, `timing`, `error`, `done`.

## How It Works

**Model tiers.** `MODEL_PROFILES` maps the user-facing names (`Super AI Lite`, `Balanced`, `Pro`) to a Gemini model and a thinking level, each overridable by environment variable. `resolve_model()` implements `auto` routing: a prompt must clear `AUTO_LONG_PROMPT_CHARS` to escalate on length alone, and complexity keywords only count once the prompt clears `AUTO_COMPLEX_MIN_CHARS`.

**Streaming pipeline.** Title generation, web search, and RAG retrieval are independent network round-trips, so all three are submitted to one `ThreadPoolExecutor` before the response opens. Only grounding is awaited before the model call; the title is emitted whenever it finishes, never delaying the first answer token. Each turn logs setup, grounding, time-to-first-token, and total milliseconds.

**Grounding.** `should_search()` gates on factual/current phrasing, then `search_web()` queries Serper through a shared pooled `httpx` client with a short timeout and a TTL cache. Results and retrieved document chunks are injected into the prompt as cited context.

**RAG.** Text-like attachments are chunked, embedded, and written to a `document_chunk` table scoped per user and conversation. Retrieval embeds the question (cached) and selects chunks by cosine similarity.

**History trimming.** `_trim_history()` keeps the newest turns inside both a message count and a character budget, because the transcript is re-sent on every turn and an unbounded one slows each answer relative to the last.

**Latency notes.** CORS preflight responses are cached for a day (`max_age=86400`) so the authenticated chat `POST` does not pay an extra round-trip per message, and the stream sets `X-Accel-Buffering: no` to stop reverse proxies from batching tokens.

## Schema Management

Tables are created on startup by `SQLModel.metadata.create_all()`. `migrate_schema()` in `main.py` handles what `create_all` cannot: it adds `user.is_verified` as nullable and backfills existing accounts as verified so no current user is locked out, then calls `rag.ensure_schema()` for the vector table. All of it is idempotent.

**There is no Alembic.** Schema changes beyond additive columns need either an idempotent statement in that startup path or a deliberate decision to add a migration tool.

## Current Gaps

Known limitations, so they are not discovered the hard way:

- **No tests.** `pytest` is a dev dependency and `pdm run pytest` is wired up, but no test modules exist.
- **No rate limiting or request size guard beyond the 25 MB upload cap.**

## Development

```bash
pdm run black .    # format (line-length 88)
pdm run isort .    # order imports (profile = "black")
pdm run pytest     # no tests yet
```

## Docker

```bash
docker build -t super-ai-api .
docker run --env-file .env -p 8000:8000 super-ai-api
```

The image installs PDM, resolves `--prod --frozen-lockfile` dependencies into system Python, and runs uvicorn on port 8000. For the full stack including Postgres, use `docker-compose.yml` at the repository root.
