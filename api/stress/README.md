# Stress harness

Locust-based stress testing for the API: pushes past expected load to find
where the system saturates and how it fails. Results CSVs go to
`stress/results/` (gitignored).

## How it works

The harness stubs nothing client-side — it points at a server started with
`STRESS_STUB_AI=true`, which replaces the Gemini/Serper/Resend tier with a
synthetic token stream (`STRESS_STUB_TOKENS`, `STRESS_STUB_TTFB_MS`,
`STRESS_STUB_TOKEN_DELAY_MS`). Every measured number is then this
application's own cost: uvicorn threads, SQLAlchemy pool, rate limiter,
Postgres.

Accounts are provisioned once per run (signup -> self-signed verification
token -> login) and cycled by all simulated users; provisioning rotates
`X-Forwarded-For` so the signup/login ceilings don't throttle setup.

## Test database (no Docker, no downloads)

The harness runs against a plain SQLite file. It costs zero network data and
starts instantly. The app's own limits (threads, connection pool checkout,
rate limiter, streaming path) are identical under SQLite; only Postgres-
specific behavior differs, so read the caveat below before trusting DB-stage
numbers.

Server-side environment for stress runs:

| Var | Stress value | Why |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./data/stress.db` | no Docker, no Supabase, no data spend |
| `STRESS_STUB_AI` | `true` | no API spend, model latency is a known constant |
| `STRESS_DIAG_ENABLED` | `true` | exposes `GET /api/internal/pool` |
| `RATE_LIMIT_ENABLED` | `true` | stages E/F need it; turn off for pure capacity runs |
| `RATE_LIMIT_TRUST_PROXY` | `true` (default) | harness buckets by XFF; stage E2 shows the spoof risk |

```powershell
cd api
$env:DATABASE_URL="sqlite:///./data/stress.db"
$env:STRESS_STUB_AI="true"; $env:STRESS_DIAG_ENABLED="true"
pdm run uvicorn app.main:app --port 8000
```

`data/` is gitignored and the server creates the tables itself on first
start. Delete `data/stress.db` between runs for a clean database. RAG is
switched off automatically for SQLite (no pgvector).

Optional, only if you happen to already have the `db` container locally:
point `DATABASE_URL` at Postgres instead for the most faithful DB stages —
never point a load run at the production Supabase database, its per-query
round-trip (0.5-5s measured) swamps every number and spends mobile data.

Harness-side knobs: `STRESS_BASE_URL`, `STRESS_PROVISION_USERS` (40),
`STRESS_REQUEST_TIMEOUT` (120s), `STRESS_RATE_PROBE_IP`. It reads the same
`api/.env` for `SECRET_KEY`/`ALGORITHM` to mint verification tokens.

## Stages

Run headless, always with `--csv stress/results/<name>`:

```powershell
pdm run locust -f stress/locustfile.py --host http://localhost:8000 --headless `
  -u 50 -r 10 -t 2m --csv stress/results/stage_b
```

| Stage | Command shape | What to read off the results |
|---|---|---|
| A baseline | `--class-weights 'ChatUser=1' -u 1 -t 1m` | `chat/setup-ms`/`ttfb-ms` floor vs the stub constants (400ms + 80x10ms) |
| B read ramp | `--class-weights 'HealthUser=1,BrowseUser=3' -u 200 -r 10 -t 5m` | p99 knee; poll `/api/internal/pool` during the run — `pool_checked_out` plateaus at size+overflow (15/16); `QueuePool ... Timeout` failures land at ~30s |
| C stream stress | `--class-weights 'ChatUser=1' -u 80 -r 5 -t 5m` | concurrency where `chat/setup-ms` exceeds the stub ttfb = anyio threadpool (~40) queueing; `chat/rate-limited-429` share grows once the sliding window fills |
| D pool limits | server with `DB_POOL_SIZE=2 DB_POOL_MAX_OVERFLOW=2`, then stage B | block-then-fail at `pool_timeout`; the cap is enforced by the app's own pool, so `GET /api/internal/pool` during the run must show `pool_checked_out` never above 2+2. Only the app-side limit is measured here; real Postgres also has its own server-side `max_connections` wall, which SQLite has no equivalent of |
| E rate limiter | `--class-weights 'RateLimitUser=1' -u 10 -r 10 -t 2m` | E1 fixed-ip: ~10 allowed then `ratelimit/fixed-ip-429`; E2 rotating-ip: zero `UNEXPECTED-429` proves XFF trust is a bypass; E3 raise `STRESS_PROVISION_USERS`/spray past 20k buckets to trip pruning; E4 restart uvicorn `--workers 2`: allowance roughly doubles (per-process counters) |
| F auth CPU starvation | stage B plus a ChatUser cohort | `chat/setup-ms` degradation under real Argon2 verifies = the login-spray coupling |
| G spike/soak | spike: `-u 150 -r 50 -t 2m`; soak: `-u 40 -r 5 -t 30m` | recovery time after load stops; during soak watch server RSS and `live_threads` for leaks (`_user_cache` has no per-email eviction cap) |
| H frontend | `cd web && npm run dev` against the saturated API | manual: interruption still works, 429/5xx surface as toasts not hangs, no per-message CORS preflight (max_age cache) |

## Metric names in the stats table

- `chat/turn` full turn; `chat/setup-ms` to first streamed byte;
  `chat/ttfb-ms` to first answer chunk; `chat/total-ms` stream close;
  `chat/rate-limited-429` expected blocks.
- `health/*`, `browse/*` read paths; `provision/account` setup cost.
- `ratelimit/*` only with `--class-weights 'RateLimitUser=1'`.

## Expected walls (findings to confirm, in order)

1. anyio threadpool (~40 sync-route threads) — first under streaming load.
2. DB pool `5 + 10` connections — `pool_timeout=30s` errors, not instant
   refusals.
3. Argon2 on login/signup — CPU starvation leaking into chat latency.
4. Rate limiter: correct per bucket, trivially bypassed by XFF when exposed
   directly, multiplied per worker process. Report; do not fix here.
