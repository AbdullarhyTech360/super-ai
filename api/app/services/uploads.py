from __future__ import annotations

import base64
import os
from pathlib import Path
from fastapi import HTTPException, UploadFile
from app.services.generate_uuid import generate_uuid

UPLOADS_DIR = Path(__file__).resolve().parents[2] / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 25 * 1024 * 1024

# MAX_FILE_SIZE is per file, so without a count ceiling one request could be
# N * 25 MB. This bounds what a single message may hold.
MAX_FILES_PER_MESSAGE = int(os.environ.get("CHAT_MAX_FILES", "8"))

# Cap on how much of a text attachment is inlined into the prompt. The whole
# body is still embedded and retrievable through RAG; only the verbatim copy
# that rides along in every request is bounded, because model time-to-first-token
# grows with prompt size and an uncapped file can dominate the prefill.
ATTACHMENT_INLINE_MAX_CHARS = int(os.environ.get("ATTACHMENT_INLINE_MAX_CHARS", "24000"))

IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/heic": ".heic",
}

ALLOWED_TYPES = {
    **IMAGE_TYPES,
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/csv": ".csv",
    "application/json": ".json",
    "text/html": ".html",
    "text/css": ".css",
    "text/x-python": ".py",
    "text/x-java-source": ".java",
    "text/x-c": ".c",
    "text/x-c++": ".cpp",
    "text/javascript": ".js",
    "application/typescript": ".ts",
    "text/x-typescript": ".ts",
    "application/x-javascript": ".js",
}

MIME_BY_EXTENSION = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".py": "text/x-python",
    ".java": "text/x-java-source",
    ".c": "text/x-c",
    ".h": "text/x-c",
    ".cpp": "text/x-c++",
    ".cc": "text/x-c++",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".ts": "application/typescript",
    ".tsx": "application/typescript",
}

TEXT_MIME_PREFIXES = ("text/",)
CODE_MIME_TYPES = {
    "text/x-python",
    "text/x-java-source",
    "text/x-c",
    "text/x-c++",
    "text/javascript",
    "application/typescript",
    "text/x-typescript",
    "application/x-javascript",
}


def is_allowed(mime_type: str) -> bool:
    return mime_type in ALLOWED_TYPES or mime_type.startswith(TEXT_MIME_PREFIXES)


def mime_extension(mime_type: str) -> str:
    ext = ALLOWED_TYPES.get(mime_type)
    if ext:
        return ext
    if mime_type in ("text/x-python",):
        return ".py"
    return ".txt"


def is_text_like(mime_type: str) -> bool:
    return mime_type.startswith(TEXT_MIME_PREFIXES) or mime_type in CODE_MIME_TYPES


def save_upload(
    user_id: str, upload: UploadFile
) -> tuple[str, str, str, str, int, bytes]:
    """Validate and persist an uploaded file.

    Returns (attachment_id, generated_path, filename, mime_type, size, data).
    The bytes are handed back so the caller can build the model request (and
    index text for RAG) without reading the file off disk a second time.
    """
    mime_type = (upload.content_type or "").lower()
    filename = upload.filename or ""

    if mime_type in ("application/octet-stream", ""):
        extension = Path(filename).suffix.lower()
        mime_type = MIME_BY_EXTENSION.get(extension, "")
    if not is_allowed(mime_type):
        raise HTTPException(
            status_code=400,
            detail=f"File type '{mime_type or 'unknown'}' is not allowed.",
        )

    attachment_id = str(generate_uuid())
    generated_name = f"{attachment_id}{mime_extension(mime_type)}"
    user_upload_dir = UPLOADS_DIR / user_id
    user_upload_dir.mkdir(parents=True, exist_ok=True)
    target = user_upload_dir / generated_name

    size = 0
    buffer = bytearray()
    with target.open("wb") as out:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail="File is too large. Maximum allowed size is 25 MB.",
                )
            out.write(chunk)
            buffer.extend(chunk)

    if not filename:
        filename = generated_name
    return attachment_id, generated_name, filename, mime_type, size, bytes(buffer)


def save_image_upload(
    user_id: str, upload: UploadFile, folder: str = "avatars"
) -> tuple[str, str, str, int]:
    """Validate and persist an image file.

    Returns (stored_relative_path, filename, mime_type, size). Only image
    mime types are allowed.
    """
    mime_type = (upload.content_type or "").lower()
    filename = upload.filename or ""

    if mime_type in ("application/octet-stream", ""):
        extension = Path(filename).suffix.lower()
        mime_type = MIME_BY_EXTENSION.get(extension, "")
    if mime_type not in IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid image type. Use JPEG, PNG, WebP, GIF, SVG, BMP, or HEIC.",
        )

    generated_name = f"{str(generate_uuid())}{mime_extension(mime_type)}"
    user_folder = UPLOADS_DIR / user_id / folder
    user_folder.mkdir(parents=True, exist_ok=True)
    target = user_folder / generated_name

    size = 0
    with target.open("wb") as out:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail="Image is too large. Maximum allowed size is 25 MB.",
                )
            out.write(chunk)

    if not filename:
        filename = generated_name
    return f"{folder}/{generated_name}", filename, mime_type, size


def attachment_url(user_id: str, generated_name: str) -> str:
    return f"/uploads/{user_id}/{generated_name}"


def build_ai_parts(attachments: list[dict], user_id: str) -> list[dict]:
    """Turn stored attachments into Gemini inline data parts.

    Each attachment dict has keys: id, generated_name, filename, mime_type, and
    optionally `data` (the bytes already read at upload time). When `data` is
    present the file is not re-read from disk; otherwise it is loaded from its
    stored path, and attachments whose file is missing are skipped.
    """
    parts: list[dict] = []
    for attachment in attachments:
        mime_type = attachment["mime_type"]
        filename = attachment["filename"]

        data = attachment.get("data")
        if data is None:
            path = UPLOADS_DIR / user_id / attachment["generated_name"]
            if not path.exists():
                continue
            data = path.read_bytes()

        if is_text_like(mime_type):
            try:
                content = data.decode("utf-8")
            except UnicodeDecodeError:
                content = None
            if content is not None and content.strip():
                if len(content) > ATTACHMENT_INLINE_MAX_CHARS:
                    content = (
                        content[:ATTACHMENT_INLINE_MAX_CHARS]
                        + "\n…[truncated for context; full text is indexed for retrieval]"
                    )
                parts.append(
                    {
                        "type": "text",
                        "text": (
                            f"Attached file '{filename}':\n"
                            f"```{mime_type}\n{content}\n```"
                        ),
                    }
                )
                continue

        encoded = base64.b64encode(data).decode()
        if mime_type in IMAGE_TYPES:
            parts.append({"type": "image", "data": encoded, "mime_type": mime_type})
        else:
            parts.append({"type": "document", "data": encoded, "mime_type": mime_type})

    return parts
