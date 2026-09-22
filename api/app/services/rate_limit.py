"""Fixed-window request ceilings for the routes that cost money or leak truth.

The API is public, so without a ceiling `/api/auth/login` can be probed
forever, every signup spends a transactional email, and each chat call bills the
Gemini and Serper APIs. Limits are counted per client address and per route, so
one busy user cannot exhaust another's allowance.

Counting lives in this process only: a single uvicorn worker gets exact
numbers, and a multi-worker deployment gets one budget per worker. Raise the
limits or move the counters to a shared store if the deployment ever fans out.
"""

import os
import threading
import time
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request

# The window a counter covers; a client regains its allowance as it rolls over.
WINDOW_SECONDS = float(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))

# Off for local runs and tests, where the shared loopback address would
# otherwise lock the developer out of their own server.
RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
)

# `X-Forwarded-For` is client-supplied. Trusting it on a direct connection lets
# a caller choose their own bucket and walk around the limit entirely, so it is
# only read when the deployment is known to sit behind a proxy that rewrites
# the header — which is how Render fronts this service.
TRUST_PROXY_HEADERS = os.environ.get("RATE_LIMIT_TRUST_PROXY", "true").lower() in (
    "1",
    "true",
    "yes",
)

# One entry per address and route. Bounded so a spray of spoofed addresses
# cannot grow the counter table without limit.
MAX_TRACKED_KEYS = int(os.environ.get("RATE_LIMIT_MAX_TRACKED_KEYS", "20000"))

# Requests per window, per address. Generous for a person, useless for a script.
LIMITS = {
    "login": int(os.environ.get("RATE_LIMIT_LOGIN", "10")),
    "signup": int(os.environ.get("RATE_LIMIT_SIGNUP", "5")),
    "email": int(os.environ.get("RATE_LIMIT_EMAIL", "5")),
    "chat": int(os.environ.get("RATE_LIMIT_CHAT", "20")),
}

# key -> (count, window deadline on the monotonic clock)
_counters: dict[str, tuple[int, float]] = {}
_lock = threading.Lock()


def _hit(key: str, limit: int) -> tuple[bool, int]:
    """Record one request against `key`; return (allowed, retry_after_seconds)."""
    now = time.monotonic()
    with _lock:
        count, deadline = _counters.get(key, (0, now + WINDOW_SECONDS))
        if deadline <= now:
            count, deadline = 0, now + WINDOW_SECONDS

        if count >= limit:
            _counters[key] = (count, deadline)
            return False, max(1, round(deadline - now))

        _counters[key] = (count + 1, deadline)
        if len(_counters) > MAX_TRACKED_KEYS:
            _prune(now)
        return True, 0


def _prune(now: float) -> None:
    """Drop windows that have already rolled over. Caller holds the lock."""
    for stale_key in [key for key, (_, d) in _counters.items() if d <= now]:
        del _counters[stale_key]
    # Still full: every window is live, so keep the soonest to expire.
    overflow = len(_counters) - MAX_TRACKED_KEYS
    if overflow > 0:
        for stale_key in sorted(_counters, key=lambda k: _counters[k][1])[:overflow]:
            del _counters[stale_key]


def client_ip(request: Request) -> str:
    """The address to rate limit, honouring the proxy chain when configured."""
    if TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # The list runs client -> last proxy; the first hop is the caller.
            origin = forwarded.split(",")[0].strip()
            if origin:
                return origin
    return request.client.host if request.client else "unknown"


def limiter(scope: str, limit: int) -> Callable[..., None]:
    """Build a route dependency that caps one endpoint for one address."""

    def enforce(request: Request) -> None:
        if not RATE_LIMIT_ENABLED:
            return
        key = f"{scope}:{client_ip(request)}"
        allowed, retry_after = _hit(key, limit)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=(
                    "Too many requests from this address. "
                    f"Please try again in {retry_after} seconds."
                ),
                headers={"Retry-After": str(retry_after)},
            )

    return enforce


login_limit = limiter("login", LIMITS["login"])
signup_limit = limiter("signup", LIMITS["signup"])
email_limit = limiter("email", LIMITS["email"])
chat_limit = limiter("chat", LIMITS["chat"])
