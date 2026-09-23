"""Behaviour of the fixed-window limiter and the ceilings it protects.

These exercise the limiter directly rather than through HTTP: the routes it
guards need a database and a Gemini key, and the thing worth pinning down is the
counting, isolation, and wiring — not the handlers behind it.
"""

import io
import time

import pytest
from fastapi import HTTPException, UploadFile

from app.services import rate_limit as rl
from app.services.uploads import MAX_FILES_PER_MESSAGE


@pytest.fixture(autouse=True)
def clean_counters():
    """Counters live in module state, so each test starts from empty."""
    rl._counters.clear()
    rl._sliding.clear()
    yield
    rl._counters.clear()
    rl._sliding.clear()


class FakeRequest:
    def __init__(self, host="203.0.113.7", headers=None):
        self.headers = headers or {}
        self.client = type("Client", (), {"host": host})()


def spend(scope, limit, request):
    """Run one guarded call; return "allow" or the 429 status."""
    try:
        rl.limiter(scope, limit)(request)
        return "allow"
    except HTTPException as exc:
        return exc.status_code


def test_allowance_is_spent_then_blocked():
    results = [spend("login", 3, FakeRequest()) for _ in range(5)]
    assert results == ["allow", "allow", "allow", 429, 429]


def test_blocked_response_tells_the_client_when_to_return():
    limiter = rl.limiter("login", 1)
    limiter(FakeRequest())
    with pytest.raises(HTTPException) as caught:
        limiter(FakeRequest())
    assert caught.value.status_code == 429
    assert int(caught.value.headers["Retry-After"]) > 0


def test_one_address_cannot_exhaust_another():
    assert spend("login", 1, FakeRequest(host="198.51.100.1")) == "allow"
    assert spend("login", 1, FakeRequest(host="198.51.100.2")) == "allow"
    assert spend("login", 1, FakeRequest(host="198.51.100.1")) == 429


def test_routes_keep_separate_buckets():
    assert spend("login", 1, FakeRequest(host="198.51.100.30")) == "allow"
    assert spend("chat", 1, FakeRequest(host="198.51.100.30")) == "allow"


def test_forwarded_header_decides_the_bucket():
    # The list runs client -> proxies; only the first hop may be throttled.
    request = FakeRequest(
        host="127.0.0.1", headers={"x-forwarded-for": "198.51.100.9, 10.0.0.1"}
    )
    assert spend("login", 2, request) == "allow"
    assert spend("login", 2, request) == "allow"
    assert spend("login", 2, request) == 429
    # The proxy address itself is untouched by that traffic.
    assert spend("login", 2, FakeRequest(host="127.0.0.1")) == "allow"


def test_window_rolls_over_and_restores_the_allowance(monkeypatch):
    monkeypatch.setattr(rl, "WINDOW_SECONDS", 0.2)
    assert spend("login", 1, FakeRequest(host="198.51.100.77")) == "allow"
    assert spend("login", 1, FakeRequest(host="198.51.100.77")) == 429
    time.sleep(0.25)
    assert spend("login", 1, FakeRequest(host="198.51.100.77")) == "allow"


def test_kill_switch_disables_enforcement(monkeypatch):
    monkeypatch.setattr(rl, "RATE_LIMIT_ENABLED", False)
    assert [spend("login", 1, FakeRequest()) for _ in range(4)] == ["allow"] * 4


def test_pruning_drops_only_expired_windows():
    for index in range(20):
        rl._hit(f"probe:{index}", 1000)
    rl._counters["stale"] = (1, time.monotonic() - 1)
    rl._prune(time.monotonic())
    assert "stale" not in rl._counters
    assert len(rl._counters) == 20


LIMITED_ROUTES = {
    "/api/auth/login": rl.login_limit,
    "/api/auth/signup": rl.signup_limit,
    "/api/auth/forgot-password": rl.email_limit,
    "/api/auth/resend-verification": rl.email_limit,
    "/api/chat": rl.chat_limit,
}


@pytest.mark.parametrize("path,limiter", sorted(LIMITED_ROUTES.items()))
def test_route_declares_its_limiter(path, limiter):
    import app.main as m

    route = next(
        route for route in m.app.routes if getattr(route, "path", None) == path
    )
    guarded = {dependency.call for dependency in route.dependant.dependencies}
    assert limiter in guarded, f"{path} is reachable without a rate limit"


def test_message_rejects_more_files_than_allowed():
    import app.main as m

    too_many = [
        UploadFile(filename=f"file-{index}.txt", file=io.BytesIO(b"x"))
        for index in range(MAX_FILES_PER_MESSAGE + 1)
    ]
    with pytest.raises(HTTPException) as caught:
        m.chat_with_ai(
            current_user=type("User", (), {"id": "user-1"})(),
            session=None,
            input="hello",
            files=too_many,
            _rate=None,
        )
    assert caught.value.status_code == 400
    assert str(MAX_FILES_PER_MESSAGE) in caught.value.detail
