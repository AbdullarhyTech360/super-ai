"""Text attachments are bounded in the prompt and read only once.

Inlining a whole file inflates model prefill (and time-to-first-token) on every
turn, while RAG still keeps the full text retrievable — so the verbatim copy is
capped. Passing the upload bytes straight through avoids re-reading the file
from disk.
"""

import io

from fastapi import UploadFile

from app.services import uploads as up


def _text_meta(filename, body_bytes, data):
    return {
        "id": "att-1",
        "generated_name": filename,
        "filename": filename,
        "mime_type": "text/plain",
        "size": len(body_bytes),
        "data": data,
    }


def test_oversized_text_is_truncated_with_a_marker(monkeypatch):
    monkeypatch.setattr(up, "ATTACHMENT_INLINE_MAX_CHARS", 100)
    body = b"y" * 500
    parts = up.build_ai_parts([_text_meta("big.txt", body, body)], user_id="u1")

    assert len(parts) == 1
    text = parts[0]["text"]
    assert "truncated for context" in text
    # Only the capped run of characters survives, not all 500.
    assert "y" * 500 not in text
    assert "y" * 100 in text


def test_text_within_budget_is_passed_through(monkeypatch):
    monkeypatch.setattr(up, "ATTACHMENT_INLINE_MAX_CHARS", 1000)
    body = b"short document"
    parts = up.build_ai_parts([_text_meta("small.txt", body, body)], user_id="u1")

    assert len(parts) == 1
    assert "short document" in parts[0]["text"]
    assert "truncated" not in parts[0]["text"]


def test_pre_read_bytes_are_used_instead_of_the_disk(monkeypatch, tmp_path):
    # Point UPLOADS_DIR at an empty dir: if build_ai_parts tried to read the
    # file it would find nothing and drop the part. Supplying `data` must win.
    monkeypatch.setattr(up, "UPLOADS_DIR", tmp_path)
    body = b"hello from memory"
    parts = up.build_ai_parts([_text_meta("mem.txt", body, body)], user_id="u1")

    assert len(parts) == 1
    assert "hello from memory" in parts[0]["text"]


def test_save_upload_returns_the_file_bytes(monkeypatch, tmp_path):
    monkeypatch.setattr(up, "UPLOADS_DIR", tmp_path)
    payload = b"a quick brown fox"
    upload = UploadFile(filename="note.txt", file=io.BytesIO(payload))

    result = up.save_upload("user-xyz", upload)

    assert len(result) == 6
    attachment_id, generated_name, filename, mime_type, size, data = result
    assert data == payload
    assert mime_type == "text/plain"
    assert size == len(payload)
    # The file is still persisted for static serving and later indexing.
    assert (tmp_path / "user-xyz" / generated_name).read_bytes() == payload
