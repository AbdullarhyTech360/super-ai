"""The turn is written to the database after the stream closes, not during it.

Persisting the messages and embedding any uploads used to run inside the
response generator, so the client sat waiting on those writes — and on multi-
second Gemini embedding calls — after the last answer token was already on
screen. They now run as a background task on a fresh session.
"""

import asyncio
import inspect
import io
import json
import time

import pytest
from fastapi import UploadFile

import app.main as m
from app.services import rag


def _drain(iterator):
    """Consume a response body iterator that may be sync or async."""
    if inspect.isasyncgen(iterator):
        async def run():
            return [line async for line in iterator]

        return asyncio.run(run())
    return list(iterator)


class _QueryChain:
    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def all(self):
        return []


class FakeRequestSession:
    """Stands in for the request-scoped session the endpoint reads through."""

    @property
    def bind(self):
        return None

    def add(self, obj):
        pass

    def add_all(self, objs):
        pass

    def commit(self):
        pass

    def refresh(self, obj):
        pass

    def get(self, model, ident):
        return None

    def query(self, *a, **k):
        return _QueryChain()


class StubConversation:
    def __init__(self):
        self.id = "conv-bg"
        self.title = ""
        self.updated_at = None


class FakeBackgroundSession:
    """A fresh session the background task writes through; records the writes."""

    def __init__(self, sink):
        self.sink = sink

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get(self, model, ident):
        return self.sink["conversation"]

    def add(self, obj):
        self.sink["added"].append(obj)

    def add_all(self, objs):
        self.sink["added"].extend(objs)

    def flush(self):
        pass

    def commit(self):
        self.sink["commits"] += 1

    def refresh(self, obj):
        pass


@pytest.fixture
def harness(monkeypatch, tmp_path):
    sink = {
        "added": [],
        "commits": 0,
        "conversation": StubConversation(),
        "indexed": False,
    }
    monkeypatch.setattr("app.services.uploads.UPLOADS_DIR", tmp_path)

    def fake_stream(*a, **k):
        yield ("chunk", "Hel")
        yield ("chunk", "lo")

    def fake_index(session, user_id, conv_id, texts):
        time.sleep(0.2)  # stand-in for the multi-second embedding round-trip
        sink["indexed"] = True

    monkeypatch.setattr(m, "stream_message_events", fake_stream)
    monkeypatch.setattr(m, "generate_title", lambda *a, **k: "My Title")
    monkeypatch.setattr(m, "Session", lambda *a, **k: FakeBackgroundSession(sink))
    monkeypatch.setattr(rag, "has_documents", lambda *a, **k: False)
    monkeypatch.setattr(rag, "index_attachments", fake_index)
    return sink


def _send(harness):
    user = type("U", (), {"id": "user-1"})()
    upload = UploadFile(filename="doc.txt", file=io.BytesIO(b"payload text " * 20))
    return m.chat_with_ai(
        current_user=user,
        session=FakeRequestSession(),
        input="summarize this",
        is_new=True,
        conversation_id=None,
        persist=True,
        history="",
        files=[upload],
        model="lite",
        show_thinking=False,
        _rate=None,
    )


def test_stream_ends_with_timing_then_done(harness):
    response = _send(harness)
    events = [json.loads(line) for line in _drain(response.body_iterator) if line.strip()]

    assert [e["type"] for e in events[-2:]] == ["timing", "done"]
    assert any(e["type"] == "chunk" for e in events)


def test_nothing_is_written_while_the_stream_is_open(harness):
    response = _send(harness)
    _drain(response.body_iterator)

    # The generator finished, yet the durable work had not started.
    assert harness["indexed"] is False
    assert harness["commits"] == 0


def test_background_task_persists_and_indexes_the_turn(harness):
    response = _send(harness)
    _drain(response.body_iterator)

    response.background.func()

    assert harness["indexed"] is True
    assert harness["commits"] >= 1
    # The AI message carries the joined answer text captured from the stream.
    texts = [getattr(obj, "text", None) for obj in harness["added"]]
    assert "Hello" in texts
