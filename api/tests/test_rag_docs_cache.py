"""The "does this conversation have indexed chunks" lookup is cached
in-process: it answers 'no' on almost every turn, yet each ask was a full
database round-trip on the critical path. Indexing and chunk deletion keep the
cached flag honest."""

import pytest

from app.services import rag


class FakeConn:
    def __init__(self, bind):
        self._bind = bind

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, *a, **k):
        self._bind.executions += 1
        return self

    def first(self):
        return object() if self._bind.has_rows else None


class FakeBind:
    def __init__(self, has_rows=False):
        self.executions = 0
        self.has_rows = has_rows

    def connect(self):
        return FakeConn(self)

    def begin(self):
        return FakeConn(self)


class FakeSession:
    def __init__(self, has_rows=False):
        self.bind = FakeBind(has_rows)


@pytest.fixture(autouse=True)
def clear_cache():
    rag._has_documents = rag.TtlCache(
        rag.HAS_DOCUMENTS_CACHE_SECONDS, max_entries=256
    )
    yield


def test_second_lookup_is_served_from_cache():
    session = FakeSession(has_rows=False)

    assert rag.has_documents(session, "u-1", "c-1") is False
    assert rag.has_documents(session, "u-1", "c-1") is False

    # One SELECT for the miss, none for the hit — even the negative answer is
    # cached, because "no documents" is the answer on almost every chat.
    assert session.bind.executions == 1


def test_positive_answer_is_cached_too():
    session = FakeSession(has_rows=True)

    assert rag.has_documents(session, "u-1", "c-2") is True
    assert rag.has_documents(session, "u-1", "c-2") is True
    assert session.bind.executions == 1


def test_deleting_chunks_invalidates_the_flag():
    session = FakeSession(has_rows=True)
    rag.has_documents(session, "u-1", "c-3")

    class FakeEngine(FakeBind):
        pass

    rag.delete_conversation_chunks(FakeEngine(), ["c-3"])
    assert rag._has_documents.get("c-3") is None

    # The next ask re-queries instead of trusting the stale True.
    empty = FakeSession(has_rows=False)
    assert rag.has_documents(empty, "u-1", "c-3") is False
    assert empty.bind.executions == 1


def test_indexing_marks_the_conversation_as_having_chunks(monkeypatch):
    monkeypatch.setattr(rag, "embed_texts", lambda texts: [[0.1] for _ in texts])
    session = FakeSession(has_rows=False)
    rag._has_documents.set("c-4", False)

    attachment_texts = [
        {"attachment_id": "a-1", "filename": "f.txt", "content": "some text"}
    ]
    rag.index_attachments(session, "u-1", "c-4", attachment_texts)

    assert rag._has_documents.get("c-4") is True
