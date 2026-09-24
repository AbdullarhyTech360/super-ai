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
from app.services.ttl_cache import TtlCache


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
        self.user_id = "user-1"
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
    # Ownership decisions must not leak between tests through the in-process
    # caches the chat path reads.
    monkeypatch.setattr(m, "_conversation_owner", TtlCache(3600, max_entries=512))

    def fake_stream(*a, **k):
        sink["history"] = list(a[1])
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


class OngoingSession(FakeRequestSession):
    """Session for an existing conversation; counts transcript queries."""

    def __init__(self):
        self.message_queries = 0
        self.gets = 0

    def get(self, model, ident):
        self.gets += 1
        return StubConversation()

    def query(self, *a, **k):
        self.message_queries += 1
        return _QueryChain()


def _send_ongoing(session, history):
    user = type("U", (), {"id": "user-1"})()
    return m.chat_with_ai(
        current_user=user,
        session=session,
        input="next question",
        is_new=False,
        conversation_id="conv-bg",
        persist=True,
        history=history,
        files=[],
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


def test_client_history_skips_the_transcript_query(harness):
    # The page already renders the transcript, so an ongoing turn that sends
    # it costs no database round-trip to fetch the same text back.
    session = OngoingSession()
    response = _send_ongoing(
        session, json.dumps([{"sender": "user", "text": "earlier question"}])
    )
    _drain(response.body_iterator)

    assert session.message_queries == 0
    assert harness["history"] == [("user", "earlier question")]


def test_missing_history_falls_back_to_the_database(harness):
    session = OngoingSession()
    response = _send_ongoing(session, "not json at all")
    _drain(response.body_iterator)

    assert session.message_queries == 1


def test_second_ongoing_turn_skips_the_ownership_query(harness):
    # The conversation row is read once and its ownership cached; the next
    # turn in the same conversation authorizes without a database round-trip.
    session = OngoingSession()
    history = json.dumps([{"sender": "user", "text": "earlier question"}])

    _drain(_send_ongoing(session, history).body_iterator)
    first_gets = session.gets
    _drain(_send_ongoing(session, history).body_iterator)

    assert first_gets == 1
    assert session.gets == 1
