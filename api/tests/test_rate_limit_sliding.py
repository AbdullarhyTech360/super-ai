"""The chat bucket slides rather than resetting all at once.

Auth ceilings stay fixed-window, so this pins down only the behaviour that made
chat worth softening: allowance is reclaimed continuously as the oldest request
ages out of the window, and Retry-After counts down toward that moment.
"""

import time
from collections import deque

import pytest

from app.services import rate_limit as rl


@pytest.fixture(autouse=True)
def clean_sliding():
    rl._sliding.clear()
    yield
    rl._sliding.clear()


def test_allowance_recovers_incrementally(monkeypatch):
    monkeypatch.setattr(rl, "WINDOW_SECONDS", 10)
    now = time.monotonic()
    # A full budget: two requests, aged 6s and 1s, both still inside the window.
    rl._sliding["chat:x"] = deque([now - 6, now - 1])
    assert rl._hit_sliding("chat:x", 2)[0] is False

    # Age the older request past the window: exactly one slot frees, so the next
    # call is allowed and the budget is immediately full again. A fixed window
    # would instead hand the whole allowance back in one step.
    rl._sliding["chat:x"][0] = now - 11
    assert rl._hit_sliding("chat:x", 2)[0] is True
    assert rl._hit_sliding("chat:x", 2)[0] is False


def test_retry_after_shrinks_as_entries_age(monkeypatch):
    monkeypatch.setattr(rl, "WINDOW_SECONDS", 5)
    rl._hit_sliding("chat:y", 1)
    _, first_wait = rl._hit_sliding("chat:y", 1)
    assert first_wait > 0

    # Age the recorded request forward so less of its window remains.
    stamps = rl._sliding["chat:y"]
    stamps[0] = stamps[0] - 2
    _, later_wait = rl._hit_sliding("chat:y", 1)
    assert later_wait < first_wait


def test_addresses_are_isolated_in_the_sliding_window():
    assert rl._hit_sliding("chat:1.1.1.1", 1)[0] is True
    assert rl._hit_sliding("chat:2.2.2.2", 1)[0] is True
    assert rl._hit_sliding("chat:1.1.1.1", 1)[0] is False


def test_limiter_wires_chat_to_the_sliding_counter():
    # chat_limit must route through _hit_sliding; a non-sliding bucket must not.
    limiter = rl.limiter("chat", 1, sliding=True)

    request = type("R", (), {"headers": {}, "client": type("C", (), {"host": "9.9.9.9"})()})()
    assert limiter(request) is None  # first allowed
    with pytest.raises(rl.HTTPException):
        limiter(request)  # second blocked
    # The block came from the sliding store, not the fixed-window one.
    assert "chat:9.9.9.9" in rl._sliding
    assert "chat:9.9.9.9" not in rl._counters
