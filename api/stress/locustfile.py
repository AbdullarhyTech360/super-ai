"""Locust stress harness for the Super AI API. See stress/README.md.

Run from the api/ directory against a server started with the stress env
matrix (STRESS_STUB_AI=true etc.), e.g.:

    pdm run locust -f stress/locustfile.py --host http://localhost:8000 \
        --headless -u 50 -r 10 -t 2m --csv stress/results/run_b

Every request goes through plain `requests` sessions and is reported by hand
via locust.events, so the streaming NDJSON chat endpoint can expose its real
phases (setup / ttfb / total) as separate metrics instead of one opaque number.
"""

from __future__ import annotations

import itertools
import json
import os
import random
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import jwt
import requests
from dotenv import load_dotenv
from locust import User, between, constant_pacing, events, task

# Run from api/ so this picks up the same .env the server loaded; the harness
# signs its own email-verification tokens with it (provisioning shortcut that
# avoids scraping a console-only email link).
load_dotenv()

BASE_URL = os.environ.get("STRESS_BASE_URL", "http://localhost:8000")
SECRET_KEY = os.environ.get("STRESS_SECRET_KEY") or os.environ.get(
    "SECRET_KEY", "your_secret_key_here"
)
ALGORITHM = os.environ.get("STRESS_ALGORITHM") or os.environ.get(
    "ALGORITHM", "HS256"
)

PASSWORD = "Str3ss-Passw0rd!"
# Accounts provisioned once at test start and cycled by every simulated user.
PROVISION_USERS = int(os.environ.get("STRESS_PROVISION_USERS", "40"))
# Provisioning runs this many accounts at once. Against a remote database one
# account takes seconds; serial provisioning would eat the whole test window
# before any simulated user traffic starts.
PROVISION_CONCURRENCY = int(os.environ.get("STRESS_PROVISION_CONCURRENCY", "8"))
REQUEST_TIMEOUT = float(os.environ.get("STRESS_REQUEST_TIMEOUT", "120"))
# The one fake client address the rate-limit probe does NOT rotate, so the
# fixed/sliding window logic is exercised against a single bucket.
RATE_PROBE_IP = os.environ.get("STRESS_RATE_PROBE_IP", "203.0.113.10")

PROMPTS = [
    "Explain how HTTP connection pooling works in a web server.",
    "Write a short poem about the sea.",
    "What are the differences between a stack and a queue in data structures?",
    "Summarize the theory of relativity for a beginner.",
    "Give me tips for improving sleep quality.",
    # Triggers should_search() so the grounding pipeline runs too (stubbed).
    "What is the latest news about renewable energy today?",
]

PROBE_PASSWORD = "wrong-password-on-purpose"


def _fire(name: str, runtime_ms: float, length: int = 0, exception=None) -> None:
    events.request.fire(
        request_type="STRESS",
        name=name,
        response_time=runtime_ms,
        response_length=length,
        exception=exception,
    )


def call(
    session: requests.Session,
    method: str,
    path: str,
    name: str,
    expect: tuple[int, ...] = (200,),
    **kwargs,
) -> requests.Response | None:
    """One measured request: `expect` statuses count as success, the rest are
    reported as failures with the status as the exception."""
    kwargs.setdefault("timeout", REQUEST_TIMEOUT)
    started = time.perf_counter()
    try:
        response = session.request(method, f"{BASE_URL}{path}", **kwargs)
    except requests.RequestException as exc:
        _fire(name, (time.perf_counter() - started) * 1000, exception=exc)
        return None
    runtime_ms = (time.perf_counter() - started) * 1000
    if response.status_code in expect:
        _fire(name, runtime_ms, length=len(response.content))
    else:
        _fire(
            name,
            runtime_ms,
            exception=RuntimeError(f"HTTP {response.status_code}: {response.text[:200]}"),
        )
    return response


def _verification_token(email: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    return jwt.encode(
        {"sub": email, "type": "email_verification", "exp": expires},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _fake_ip() -> str:
    # Any address works: the server buckets by X-Forwarded-For (its rate
    # limiter trusts the header by default), which also keeps provisioning
    # traffic from tripping the signup/login ceilings from one loopback bucket.
    return f"10.66.{random.randint(1, 254)}.{random.randint(1, 254)}"


def _session() -> requests.Session:
    session = requests.Session()
    # Never route through HTTP_PROXY from the environment: the target is
    # usually localhost, and a proxy turns refused connections into seconds
    # of dead wait.
    session.trust_env = False
    return session


def _provision_account(email: str) -> dict:
    """Create + verify + log in one stress account; returns its identity.
    Opens its own session so many accounts can provision in parallel."""
    session = _session()
    headers = {"X-Forwarded-For": _fake_ip()}
    response = session.post(
        f"{BASE_URL}/api/auth/signup",
        json={"full_name": "Stress User", "email": email, "password": PASSWORD},
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    response = session.post(
        f"{BASE_URL}/api/auth/verify-email",
        json={"token": _verification_token(email)},
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return {"email": email, "ip": headers["X-Forwarded-For"], "token": response.json()["access_token"]}


def _timed_provision(email: str) -> dict | None:
    """Provision one account and report it as a harness metric; failures are
    counted but never abort the other accounts."""
    started = time.perf_counter()
    try:
        account = _provision_account(email)
        _fire("provision/account", (time.perf_counter() - started) * 1000)
        return account
    except Exception as exc:
        _fire("provision/account", (time.perf_counter() - started) * 1000, exception=exc)
        return None


_accounts: list[dict] = []
_accounts_cycle: itertools.cycle | None = None
_provision_lock = threading.Lock()


@events.test_start.add_listener
def _on_test_start(environment, **kwargs):
    """Provision the shared account pool once per run (not per simulated
    user): signup hashes Argon2 passwords synchronously, and doing that for
    every spawn would measure the harness, not the server."""
    global _accounts_cycle
    with _provision_lock:
        if not _accounts:
            emails = [
                f"stress-{uuid.uuid4().hex[:10]}@stress.test"
                for _ in range(PROVISION_USERS)
            ]
            # Locust green-patches threading, so this pool runs as greenlets.
            with ThreadPoolExecutor(max_workers=PROVISION_CONCURRENCY) as pool:
                results = list(pool.map(_timed_provision, emails))
            _accounts.extend(r for r in results if r)
            failed = len(results) - len(_accounts)
            if failed:
                print(f"[stress] provisioning: {len(_accounts)} ok, {failed} failed")
            if not _accounts:
                raise RuntimeError(
                    "Could not provision any stress account - is the server "
                    f"up at {BASE_URL} and is SECRET_KEY/ALGORITHM identical to it?"
                )
        _accounts_cycle = itertools.cycle(_accounts)


def next_account() -> dict:
    if _accounts_cycle is None:
        raise RuntimeError("Account pool missing - test_start did not provision it.")
    return next(_accounts_cycle)


class StressUser(User):
    """Base: one requests session bound to a provisioned account's identity."""

    abstract = True

    def on_start(self):
        self.account = next_account()
        self.session = _session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.account['token']}",
                "X-Forwarded-For": self.account["ip"],
            }
        )


class HealthUser(StressUser):
    """Cheapest possible path: no chat, no DB-heavy reads (user row is cached).
    Its ceiling is the raw request-handling capacity of the server."""

    weight = 1
    wait_time = between(0.2, 1.0)

    @task
    def root(self):
        call(self.session, "GET", "/", name="health/root")

    @task
    def me(self):
        call(self.session, "GET", "/api/me", name="health/me")

    @task
    def pool(self):
        # 404 when STRESS_DIAG_ENABLED is off; either way it is a cheap probe.
        call(self.session, "GET", "/api/internal/pool", name="health/pool", expect=(200, 404))


class BrowseUser(StressUser):
    """Read paths the chat page issues on open: conversation headers, stats,
    and one transcript. These hold a DB connection for the duration of the
    query, so their ramp finds the pool wall."""

    weight = 2
    wait_time = between(1.0, 3.0)

    def on_start(self):
        super().on_start()
        self.conversation_id: str | None = None

    @task(3)
    def conversations(self):
        response = call(
            self.session,
            "GET",
            "/api/conversations",
            params={"limit": 50, "offset": 0},
            name="browse/conversations",
        )
        if response is not None:
            items = response.json().get("conversations") or []
            if items:
                self.conversation_id = items[0]["id"]

    @task(2)
    def stats(self):
        call(self.session, "GET", "/api/stats", name="browse/stats")

    @task(1)
    def messages(self):
        if self.conversation_id is None:
            return
        call(
            self.session,
            "GET",
            f"/api/conversations/{self.conversation_id}/messages",
            name="browse/messages",
        )


class ChatUser(StressUser):
    """Full turns against the streamed NDJSON endpoint. Each turn occupies one
    sync-route thread plus one DB connection for its whole life, so this is
    the workload that saturates the anyio threadpool first."""

    weight = 1
    # No wait: the turn itself (stub ttfb + tokens) is the pacing; back-to-back
    # turns keep every simulated user's stream live.
    wait_time = between(0.1, 0.5)

    def on_start(self):
        super().on_start()
        self.conversation_id: str | None = None
        self.history: list[dict] = []

    @task
    def chat_turn(self):
        prompt = random.choice(PROMPTS)
        form = {
            "input": prompt,
            "is_new": "false" if self.conversation_id else "true",
            "persist": "true",
            "model": "auto",
            "show_thinking": random.choice(["true", "false"]),
        }
        if self.conversation_id:
            form["conversation_id"] = self.conversation_id
            # Letting the server skip its history SELECT mirrors the real
            # client, so the stress profile matches production traffic.
            form["history"] = json.dumps(self.history[-20:])

        # (None, value) tuples force multipart encoding, the way the browser's
        # FormData does when only string fields are present.
        files = {key: (None, str(value)) for key, value in form.items()}
        started = time.perf_counter()
        answer_parts: list[str] = []
        setup_ms = ttfb_ms = None
        try:
            response = self.session.post(
                f"{BASE_URL}/api/chat",
                files=files,
                stream=True,
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            _fire("chat/turn", (time.perf_counter() - started) * 1000, exception=exc)
            return

        if response.status_code == 429:
            # An expected outcome once the sliding window fills up; counted,
            # never a failure.
            response.close()
            _fire("chat/rate-limited-429", (time.perf_counter() - started) * 1000)
            return
        if response.status_code != 200:
            body = response.text[:200]
            response.close()
            _fire(
                "chat/turn",
                (time.perf_counter() - started) * 1000,
                exception=RuntimeError(f"HTTP {response.status_code}: {body}"),
            )
            return

        stream_error: str | None = None
        try:
            for line in response.iter_lines(decode_unicode=True):
                if setup_ms is None:
                    setup_ms = (time.perf_counter() - started) * 1000
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                kind = event.get("type")
                if kind == "chunk":
                    if ttfb_ms is None:
                        ttfb_ms = (time.perf_counter() - started) * 1000
                    answer_parts.append(event.get("text", ""))
                elif kind == "start":
                    self.conversation_id = event.get("conversation_id") or self.conversation_id
                elif kind == "error":
                    stream_error = event.get("detail", "stream error")
                elif kind == "done":
                    break
        except requests.RequestException as exc:
            stream_error = f"stream aborted: {exc}"
        finally:
            response.close()

        total_ms = (time.perf_counter() - started) * 1000
        _fire("chat/setup-ms", setup_ms if setup_ms is not None else total_ms)
        if ttfb_ms is not None:
            _fire("chat/ttfb-ms", ttfb_ms)
        _fire("chat/total-ms", total_ms)
        if stream_error:
            _fire("chat/turn", total_ms, exception=RuntimeError(stream_error))
        else:
            _fire("chat/turn", total_ms, length=sum(len(p) for p in answer_parts))
            answer = "".join(answer_parts)
            self.history.append({"sender": "user", "text": prompt})
            self.history.append({"sender": "ai", "text": answer})
            del self.history[:-20]


class RateLimitUser(StressUser):
    """Not in the default mix (weight 0): enable with
    --class-weights 'RateLimitUser=1' for the rate-limiter stages.

    Two probes run side by side against the login endpoint:
    - fixed fake IP: the bucket must fill (401s up to the limit, then 429s);
    - rotating fake IPs: every request gets its own bucket, so 429 never
      appears. That asymmetry is the documented X-Forwarded-For trust risk
      (RATE_LIMIT_TRUST_PROXY=true) - it only means anything while the target
      is reachable directly, never through the production proxy."""

    weight = 0
    wait_time = constant_pacing(0.05)

    def on_start(self):
        # Deliberately skips the shared account: these probes hammer an
        # endpoint, they do not need an authenticated identity.
        self.session = _session()
        self._rotations = itertools.count()

    @task(1)
    def flood_fixed_ip(self):
        response = call(
            self.session,
            "POST",
            "/api/auth/login",
            name="ratelimit/fixed-ip",
            expect=(401, 429),
            json={"email": "probe@stress.test", "password": PROBE_PASSWORD},
            headers={"X-Forwarded-For": RATE_PROBE_IP},
        )
        if response is not None and response.status_code == 429:
            # Static metric name; the Retry-After header is inspected in the
            # live server log / manual probes, not baked into stats names.
            _fire("ratelimit/fixed-ip-429", 0)

    @task(1)
    def flood_rotating_ip(self):
        count = next(self._rotations)
        response = call(
            self.session,
            "POST",
            "/api/auth/login",
            name="ratelimit/rotating-ip",
            expect=(401,),
            json={"email": "probe@stress.test", "password": PROBE_PASSWORD},
            # 10.200.x.y gives 65k distinct buckets before any reuse.
            headers={"X-Forwarded-For": f"10.200.{count // 254 % 256}.{count % 254 + 1}"},
        )
        if response is not None and response.status_code == 429:
            _fire(
                "ratelimit/rotating-ip-UNEXPECTED-429",
                0,
                exception=RuntimeError("rotating IPs should never fill one bucket"),
            )
