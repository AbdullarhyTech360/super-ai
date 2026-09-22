# Super-AI

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Overview

Super-AI is a full-stack AI chat application: a React single-page frontend talking to a FastAPI backend that streams Gemini responses turn by turn. Each conversation is grounded on demand — via live web search for factual questions, and via retrieval over the files you have uploaded — and every answer arrives as it is generated.

The repository is a monorepo: `web/` (frontend) and `api/` (backend) live side by side and are orchestrated together with Docker Compose.

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Not Yet Implemented](#not-yet-implemented)
- [Tech Stack](#tech-stack)
- [How a Chat Turn Works](#how-a-chat-turn-works)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Running with Docker Compose](#running-with-docker-compose)
- [Database](#database)
- [Deployment](#deployment)
- [Development](#development)
- [Contribution](#contribution)
- [Support](#support)
- [About Us](#about-us)
- [License](#license)

## Screenshots

**Landing Page:**

![Super-AI Landing Page](docs/screenshots/landing.jpg)

**Login Page:**

![Super-AI Login Page](docs/screenshots/login.jpg)

**Chat Page:**

![Super-AI Chat Page](docs/screenshots/chat.jpg)

## Features

### Conversation

- **Streaming answers** over newline-delimited JSON, with a live progress stage (`Searching the web` → `Gathering context` → `Thinking` → `Answering`) so the wait is never silent.
- **Interruptible generation** — the send button becomes a stop control and aborts the in-flight request.
- **Model tiers**: `Auto`, `Super AI Lite`, `Super AI Balanced`, `Super AI Pro`. `Auto` escalates to a heavier tier only when the prompt actually warrants it (length and complexity thresholds). Each tier maps to a configurable Gemini model plus a reasoning budget.
- **Optional reasoning display**: a per-message toggle for showing the model's thinking steps.
- **Automatic titles** generated on a side call that never delays the first answer token; conversations can also be renamed by hand.
- **Temporary chats** that answer without writing a conversation or transcript to the database.
- **Conversation management**: search, sort, select, rename, delete, bulk delete, with server-side pagination so the sidebar stays fast on long-lived accounts.
- **History trimming**: only the newest turns within a message and character budget are re-sent to the model, so long chats do not degrade over time.

### Grounding

- **Web search grounding** (Serper.dev) for factual, current, or news-style questions; results are injected as cited context and cached briefly.
- **RAG over your files** (pgvector): text-like uploads are chunked, embedded with `gemini-embedding-001`, and retrieved by cosine similarity on later turns, so answers come from your actual documents.
- **Anti-fabrication instructions**: the system prompt requires citing grounded sources and saying "I don't know" rather than guessing.

### Files and input

- **Attachments** up to 25 MB per file: images (JPEG, PNG, WebP, GIF, SVG, BMP, HEIC), PDF/Office documents, CSV/JSON, and common source-code formats. Images go to the model as vision input.
- **Voice input** via the Web Speech API.
- **Avatar upload** on the profile page.

### Accounts and security

- **JWT authentication** with Argon2 password hashing (`pwdlib`).
- **Email verification** on signup (Resend, or console delivery in development), with a resend flow.
- **Password reset** by emailed link, and in-app password change.
- **Privacy-preserving responses**: reset and resend endpoints return the same message whether or not the account exists.
- **Data export** of all conversations and messages as JSON, and full **account deletion** that removes rows and stored files.
- **CORS preflight caching** (24 h `max-age`) so authenticated chat posts skip an extra round-trip.

### Interface

- **8 chat themes** (Default, Aurora, Sunset, Ocean, Midnight, Emerald, Blush, Mist) plus light / dark / system colour schemes.
- **Markdown rendering** with syntax-highlighted code blocks, KaTeX math, and GitHub-flavoured tables.
- Collapsible sidebar, responsive composer, per-route error boundaries, skeleton loading, and offline-friendly client caching with TanStack Query.
- SEO metadata, Open Graph tags, JSON-LD, and prerendered static routes.

## Not Yet Implemented

Listed explicitly so the docs are not mistaken for the code:

- **Image generation.** The app accepts images as input but cannot produce them. No generation endpoint exists.
- **Social sign-in.** The Google and Microsoft buttons on the login page are placeholders that show a "coming soon" toast. There is no OAuth provider integration.

## Tech Stack

**Frontend (`web/`)**

- [Vite](https://vitejs.dev/) 5 + [React](https://react.dev/) 18 + TypeScript 5
- [React Router](https://reactrouter.com/) v6 (`BrowserRouter`, not the Next.js app router)
- [shadcn/ui](https://ui.shadcn.com/) on Radix primitives, [Tailwind CSS](https://tailwindcss.com/) 3
- [@tanstack/react-query](https://tanstack.com/query) 5 for server state
- react-markdown + remark/rehype (GFM, math, KaTeX, highlight.js)
- lucide-react icons, zod + react-hook-form, sonner + radix toast

**Backend (`api/`)**

- [FastAPI](https://fastapi.tiangolo.com/) with `StreamingResponse` (NDJSON)
- [SQLModel](https://sqlmodel.tiangolo.com/) / SQLAlchemy, `psycopg2-binary`
- [google-genai](https://github.com/googleapis/python-genai) SDK for Gemini chat, vision, and embeddings
- [PyJWT](https://pyjwt.readthedocs.io/) for tokens, `pwdlib[argon2]` for hashing
- `httpx` for search grounding, Resend for transactional email
- [PDM](https://pdm-project.org/) for dependency management, Python 3.13

**Infrastructure**

- PostgreSQL 16 with the [pgvector](https://github.com/pgvector/pgvector) extension (Supabase in this deployment)
- Docker and Docker Compose
- GitHub Actions → GitHub Pages for the frontend

## How a Chat Turn Works

`POST /api/chat` returns an NDJSON stream. The client reads it incrementally:

| Event | Payload | Purpose |
|---|---|---|
| `start` | conversation id, provisional title, attachments, resolved model | Opens the turn |
| `stage` | stage name and human label | What the turn is doing right now |
| `thinking` | reasoning text | Only when thinking display is enabled |
| `chunk` | text delta | The answer, token by token |
| `title` | generated title | Arrives whenever it is ready, never before the first chunk |
| `timing` | setup / grounding / ttfb / total milliseconds | Latency instrumentation |
| `done` | — | Stream closed |
| `error` | detail | Model or stream failure |

Three independent side tasks — title generation, web search, and RAG retrieval — are submitted to one thread pool before the response opens, because queueing them serially simply added their latencies together. Only grounding is awaited before the model call.

## Project Structure

```
.
├── api/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py           # App setup and every HTTP route
│   │   ├── db/               # Engine, session, schema bootstrap
│   │   ├── models/           # SQLModel tables: user, conversation, message, attachment
│   │   ├── schemas/          # Pydantic request bodies
│   │   └── services/         # conversation_ai, rag, search_grounding, uploads, email, ttl_cache
│   ├── data/uploads/         # Stored attachments and avatars
│   └── Dockerfile
├── web/                      # Vite + React frontend
│   ├── src/
│   │   ├── pages/            # One file per route
│   │   ├── components/       # App components + components/ui (shadcn)
│   │   ├── hooks/            # useAuth, useTheme, use-mobile, use-toast
│   │   ├── lib/              # api client, chatThemes, preferences, utils
│   │   └── seo/              # Route metadata and JSON-LD
│   ├── scripts/prerender.mjs # Static build of public routes
│   └── Dockerfile
├── docs/screenshots/         # Images used by this README
├── .github/workflows/        # deploy-web.yml (GitHub Pages)
└── docker-compose.yml        # db + backend + frontend
```

Note: `api/app/routers/` exists as an empty package. Routes are currently defined in `api/app/main.py`; extract them into `routers/` before adding a new resource area.

## Getting Started

### Prerequisites

- **Node.js** 20 or newer (CI uses 20, the frontend image uses 22)
- **Python 3.13** — `api/pyproject.toml` pins `requires-python = "==3.13.*"`
- **PDM** (`pip install pdm`)
- A **PostgreSQL 16 database with pgvector**, or [Docker](https://www.docker.com/) to start one (see below)

### 1. Configure the backend

```bash
cd api
# Create .env and fill in the values from the table below
pdm install
pdm run uvicorn app.main:app --reload --port 8000
```

The API listens on http://127.0.0.1:8000 (interactive docs at `/docs`). Tables are created on startup; there is no migration tool.

> **Careful with `--reload`**: the reloader has been observed to leave a wedged process behind on Windows. Prefer restarting the server manually when a change does not appear to take effect.

### 2. Configure the frontend

```bash
cd web
npm install
npm run dev
```

The dev server is configured on **port 8080** (`web/vite.config.ts`), so the app is at http://localhost:8080. `VITE_API_BASE_URL` in `web/.env.development` must point at the backend, and that origin must appear in the backend's `CORS_ORIGINS`.

### 3. Or use Docker Compose

```bash
docker-compose up --build
```

This starts `pgvector/pgvector:pg16` as `db`, the backend, and the frontend dev server. See [Running with Docker Compose](#running-with-docker-compose) for the port details.

## Environment Variables

### Backend — `api/.env`

`app/main.py` loads this file through `python-dotenv` at import time.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | SQLAlchemy URL, e.g. `postgresql+psycopg2://user:pass@host:5432/db`. Startup fails without it. |
| `GEMINI_API_KEY` | **Yes** | Chat, vision, title generation, and embeddings |
| `SECRET_KEY` | **Yes** | JWT signing key |
| `ALGORITHM` | No | Defaults to `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Defaults to `10080` (7 days) |
| `VERIFY_TOKEN_EXPIRE_MINUTES` | No | Email verification link lifetime, default `30` |
| `RESET_TOKEN_EXPIRE_MINUTES` | No | Password reset link lifetime, default `30` |
| `DB_SSLMODE` | No | `require` for managed Postgres (Supabase); defaults to `disable` for local |
| `CORS_ORIGINS` | No | Comma-separated allow-list |
| `FRONTEND_BASE_URL` | No | Used to build email verification and reset links |
| `EMAIL_PROVIDER` | No | `resend` or `console` |
| `RESEND_API_KEY`, `EMAIL_FROM` | For real email | Verification mails are otherwise logged |
| `SERPER_API_KEY` | For web search | Without it, grounding is skipped silently |
| `SERPER_GL`, `SERPER_HL` | No | Search region and language |
| `RAG_ENABLED` | No | Default `true`; requires pgvector |
| `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | No | `gemini-embedding-001` / `1536` |
| `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_MAX_CHUNKS_PER_FILE`, `RAG_MAX_RESULTS` | No | Retrieval tuning |
| `GEMINI_MODEL_LITE` / `_BALANCED` / `_PRO` / `_TITLE` | No | Override the Gemini model per tier |
| `GEMINI_LITE_THINKING` / `_BALANCED_` / `_PRO_` / `_TITLE_THINKING` | No | `low` \| `medium` \| `high` reasoning budget |
| `TITLE_MAX_OUTPUT_TOKENS`, `TITLE_MAX_CHARS` | No | Keep the token budget generous — thinking tokens consume it first |
| `AUTO_LONG_PROMPT_CHARS`, `AUTO_COMPLEX_MIN_CHARS` | No | `Auto` routing thresholds |
| `CHAT_HISTORY_MAX_MESSAGES`, `CHAT_HISTORY_MAX_CHARS` | No | History trimming |
| `CHAT_LIST_PAGE_SIZE`, `CHAT_MESSAGE_PAGE_SIZE` | No | Pagination sizes |
| `SEARCH_TIMEOUT_SECONDS`, `SEARCH_CACHE_SECONDS`, `RAG_EMBEDDING_CACHE_SECONDS` | No | Grounding latency caps |

Never commit `api/.env`; it is git-ignored.

### Frontend — `web/.env.development` / `web/.env.production`

| Variable | Value in this repo |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` in development; the deployed API origin in production |

## API Reference

All paths are relative to the API origin. Authentication is a `Bearer` JWT from `/api/auth/login`; everything except the auth and status routes requires it.

**Auth and account**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | Create account, send verification email |
| `POST` | `/api/auth/login` | Form-encoded credentials → access token |
| `POST` | `/api/auth/verify-email` | Consume a verification token |
| `POST` | `/api/auth/resend-verification` | Re-send the verification link |
| `POST` | `/api/auth/forgot-password` | Issue a reset link |
| `POST` | `/api/auth/reset-password` | Consume a reset token |
| `GET` | `/api/get/user` | Look up a user id by email |
| `GET` / `PUT` / `DELETE` | `/api/me` | Read profile, update name, delete account and files |
| `POST` | `/api/me/avatar` | Upload an avatar image |
| `POST` | `/api/change-password` | Change password with the current one |
| `GET` | `/api/export` | All conversations and messages as JSON |
| `GET` | `/api/stats` | Conversation and message totals for the profile page |

**Chat**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Multipart form (`input`, `conversation_id`, `files`, `model`, `show_thinking`, …) → NDJSON stream |
| `GET` | `/api/conversations` | Paginated conversation headers |
| `GET` | `/api/conversations/{id}/messages` | A transcript, newest page first |
| `PUT` | `/api/conversations/{id}` | Rename |
| `DELETE` | `/api/conversations/{id}` | Delete, including stored attachments |
| `POST` | `/api/conversations/bulk-delete` | Delete by id list |

Uploads are served back under `/uploads/...`, mounted as static files.

## Running with Docker Compose

| Service | Host port | Container port |
|---|---|---|
| `db` (pgvector/pg16) | 5432 | 5432 |
| `backend` | 8000 | 8000 |
| `frontend` | 3000 | 5173 |

`db_data` and `uploads_data` are named volumes. Secrets are read from `api/.env` through `env_file`.

> **Known issue:** the frontend service publishes `3000:3000` while its command binds the dev server to `5173`, so the intended `http://localhost:3000` URL does not currently respond. Change the mapping to `"3000:5173"` (or point `VITE_API_BASE_URL`/`CORS_ORIGINS` at whichever port you settle on).

## Database

The application requires **PostgreSQL with the pgvector extension**. `DATABASE_URL` must be set; there is no SQLite fallback, and RAG storage depends on `pgvector` vector columns and similarity operators.

- Tables are created at startup with `SQLModel.metadata.create_all()`.
- `migrate_schema()` in `api/app/main.py` applies the additive changes `create_all` cannot express (currently the `user.is_verified` column plus a backfill), and `rag.ensure_schema()` creates the `document_chunk` table.
- There is **no Alembic**. Schema changes beyond simple additive columns need a hand-written, idempotent statement in that path, or a migration tool introduced deliberately.

For local development, `docker-compose up db` provides a pgvector-enabled Postgres; managed providers such as Supabase work with `DB_SSLMODE=require`.

## Deployment

- **Frontend:** `.github/workflows/deploy-web.yml` runs on pushes touching `web/**` on `main`. It executes `npm run build:seo` (Vite build plus a puppeteer prerender of the public routes) and publishes `web/dist` to the `gh-pages` branch. `web/public/CNAME` carries the custom domain.
- **Backend:** containerised through `api/Dockerfile` (Python 3.13-slim, PDM install, uvicorn on 8000). `web/.env.production` currently targets a Render URL.
- Set `DB_SSLMODE=require`, real `SECRET_KEY`/`GEMINI_API_KEY`, production `CORS_ORIGINS`, and `FRONTEND_BASE_URL` in the deployed environment.

## Development

```bash
# Backend
cd api
pdm run black .      # format
pdm run isort .      # order imports (profile = "black")
pdm run pytest       # test runner is installed, but there are no test modules yet

# Frontend
cd web
npm run lint
npm run build        # production bundle
npm run build:seo    # bundle + prerender
npm run preview      # serve the built bundle locally
```

**Folder conventions**

- Backend routes live in `api/app/main.py` until split into `api/app/routers/`; business logic goes in `api/app/services/`, tables in `api/app/models/`, request/response shapes in `api/app/schemas/`, and DB plumbing in `api/app/db/`.
- Frontend routes go in `web/src/pages/`, shared UI in `web/src/components/` (generated shadcn primitives in `components/ui/`), API access and utilities in `web/src/lib/`, and stateful logic in `web/src/hooks/`. Import via the `@/` alias.

## Contribution

We welcome contributions from the community!

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for the contributing guidelines.
- Check open issues or start a discussion to suggest features or report bugs.
- Include screenshots with UI changes.

## Support

For technical support, feature requests, or questions, please open an issue or contact us at [abdullahimaikidandan@gmail.com](mailto:abdullahimaikidandan@gmail.com).

## About Us

Super-AI is developed by [@AbdullarhyTech360](https://github.com/AbdullarhyTech360) and contributors—a team passionate about making advanced AI easy and accessible for everyone.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

*Empowering your daily tasks with the power of AI—Super-AI Team*
