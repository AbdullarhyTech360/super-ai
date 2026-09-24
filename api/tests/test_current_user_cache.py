"""Auth caches the user row so a request does not pay a database round-trip
just to learn who is calling. The JWT already names the user; the row is kept
as a short-lived read-only snapshot, and only mutation endpoints re-read it."""

import time

import pytest

import app.main as m


class CountingSession:
    def __init__(self, user):
        self.queries = 0
        self.expunged = []
        self._user = user

    def query(self, *a, **k):
        self.queries += 1
        return self

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._user

    def expunge(self, obj):
        self.expunged.append(obj)


@pytest.fixture(autouse=True)
def clear_cache():
    m._user_cache.clear()
    yield
    m._user_cache.clear()


@pytest.fixture
def user():
    return m.User(
        id="u-1", full_name="Test", email="t@example.com", hashed_password="x"
    )


@pytest.fixture
def token():
    return m.jwt.encode({"sub": "t@example.com"}, m.SECRET_KEY, algorithm=m.ALGORITHM)


def test_second_call_is_served_from_cache(token, user):
    session = CountingSession(user)

    first = m.get_current_user(token, session)
    second = m.get_current_user(token, session)

    assert session.queries == 1
    assert first is second


def test_expired_entry_requeries(token, user, monkeypatch):
    session = CountingSession(user)
    m.get_current_user(token, session)

    monkeypatch.setattr(m, "USER_CACHE_TTL_SECONDS", 0.05)
    time.sleep(0.06)

    m.get_current_user(token, session)
    assert session.queries == 2


def test_invalidate_drops_the_entry(token, user):
    session = CountingSession(user)
    m.get_current_user(token, session)
    m._user_cache_invalidate("t@example.com")
    m.get_current_user(token, session)
    assert session.queries == 2


def test_cached_user_is_detached_from_the_request_session(token, user):
    session = CountingSession(user)
    m.get_current_user(token, session)
    # The snapshot must not stay attached, or a later flush in the same
    # request could write it back implicitly.
    assert session.expunged == [user]
