"""pgvector-backed RAG over a user's uploaded text attachments.

Chunks of text-like uploads are embedded with the Gemini embedding model and
stored in a per-user `document_chunk` table. On chat, relevant chunks are
retrieved by cosine similarity and injected into the prompt as grounding
context, so the model answers from the user's actual files instead of
hallucinating.
"""
import os

from dotenv import load_dotenv
from sqlalchemy import text

from app.services.ttl_cache import TtlCache

load_dotenv()

EMBEDDING_MODEL = os.environ.get(
    "EMBEDDING_MODEL", "gemini-embedding-001"
)
EMBEDDING_DIMENSIONS = int(
    os.environ.get("EMBEDDING_DIMENSIONS", "1536")
)
RAG_ENABLED = os.environ.get("RAG_ENABLED", "true").lower() in ("1", "true", "yes")
CHUNK_SIZE = int(os.environ.get("RAG_CHUNK_SIZE", "1200"))
CHUNK_OVERLAP = int(os.environ.get("RAG_CHUNK_OVERLAP", "150"))
MAX_CHUNKS_PER_FILE = int(os.environ.get("RAG_MAX_CHUNKS_PER_FILE", "60"))
MAX_RESULTS = int(os.environ.get("RAG_MAX_RESULTS", "6"))

# Retrieval runs in front of the model on every turn, so the same question
# asked twice within this window only embeds once.
EMBEDDING_CACHE_SECONDS = float(os.environ.get("RAG_EMBEDDING_CACHE_SECONDS", "120"))

_embed_client = None
_query_embeddings = TtlCache(EMBEDDING_CACHE_SECONDS)


def _client():
    global _embed_client
    if _embed_client is None:
        from google import genai

        _embed_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    return _embed_client


def is_enabled() -> bool:
    return RAG_ENABLED


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts with the Gemini embedding model."""
    if not texts:
        return []
    from google.genai.types import EmbedContentConfig

    resp = _client().models.embed_content(
        model=EMBEDDING_MODEL,
        contents=texts,
        config=EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS),
    )
    return [emb.values for emb in resp.embeddings]


def embed_query(text: str) -> list[float]:
    """Embed a single query for similarity search."""
    if not text.strip():
        return []
    cached = _query_embeddings.get(text)
    if cached is not None:
        return cached
    from google.genai.types import EmbedContentConfig

    resp = _client().models.embed_content(
        model=EMBEDDING_MODEL,
        contents=[text],
        config=EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS),
    )
    embedding = resp.embeddings[0].values
    if embedding:
        _query_embeddings.set(text, embedding)
    return embedding


def chunk_text(text: str) -> list[str]:
    """Naive paragraph-aware chunking with overlap."""
    if not text.strip():
        return []
    text = text.replace("\r\n", "\n")
    chunks: list[str] = []
    start = 0
    length = len(text)
    while start < length and len(chunks) < MAX_CHUNKS_PER_FILE:
        end = start + CHUNK_SIZE
        if end >= length:
            chunks.append(text[start:].strip())
            break
        # Try to break at a paragraph/newline near the target size.
        search_start = max(start + int(CHUNK_SIZE * 0.6), start + 1)
        newline = text.rfind("\n\n", search_start, end)
        space = text.rfind(" ", search_start, end)
        break_at = max(newline, space)
        if break_at > search_start:
            end = break_at
        chunks.append(text[start:end].strip())
        start = max(start + 1, end - CHUNK_OVERLAP)
    return [c for c in chunks if c]


def ensure_schema(engine) -> None:
    """Create the vector extension and document_chunk table if missing.

    Self-healing: if the table already exists with a different embedding
    dimensionality (e.g. it was created earlier while EMBEDDING_DIMENSIONS was
    still 3072), it is rebuilt to match the configured dimensions. HNSW indexes
    are avoided because pgvector caps them at 2000 dimensions; retrieval uses an
    index-free exact cosine scan, which is fast enough at this scale.
    """
    desired_type = f"vector({EMBEDDING_DIMENSIONS})"
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

        row = conn.execute(
            text(
                "SELECT format_type(atttypid, atttypmod) "
                "FROM pg_attribute "
                "WHERE attrelid = 'document_chunk'::regclass "
                "  AND attname = 'embedding' AND NOT attisdropped"
            )
        ).fetchone()
        current_type = row[0] if row else None
        if current_type is not None and current_type != desired_type:
            conn.execute(text("DROP TABLE IF EXISTS document_chunk"))
            current_type = None

        if current_type is None:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE IF NOT EXISTS document_chunk (
                        id VARCHAR PRIMARY KEY,
                        user_id VARCHAR NOT NULL,
                        conversation_id VARCHAR NOT NULL,
                        attachment_id VARCHAR,
                        filename VARCHAR NOT NULL DEFAULT '',
                        content TEXT NOT NULL,
                        embedding {desired_type} NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
            )

        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_document_chunk_user "
                "ON document_chunk (user_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_document_chunk_conversation "
                "ON document_chunk (conversation_id)"
            )
        )
        conn.execute(
            text("DROP INDEX IF EXISTS ix_document_chunk_embedding")
        )


def index_attachments(
    session,
    user_id: str,
    conversation_id: str,
    attachment_texts: list[dict],
) -> None:
    """Embed and store chunks for text attachments.

    attachment_texts: list of {"attachment_id", "filename", "content"}.
    Runs best-effort; failures must never block chat.
    """
    if not is_enabled() or not attachment_texts:
        return
    if len(attachment_texts) > 8:
        attachment_texts = attachment_texts[:8]

    from app.services.generate_uuid import generate_uuid

    pending: list[dict] = []
    for meta in attachment_texts:
        content = (meta.get("content") or "").strip()
        if not content:
            continue
        for idx, chunk in enumerate(chunk_text(content)):
            pending.append(
                {
                    "id": str(generate_uuid()),
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "attachment_id": meta.get("attachment_id"),
                    "filename": meta.get("filename", ""),
                    "content": chunk,
                }
            )

    if not pending:
        return

    try:
        embeddings = embed_texts([p["content"] for p in pending])
    except Exception:
        return

    try:
        with session.bind.begin() as conn:
            for row, embedding in zip(pending, embeddings):
                conn.execute(
                    text(
                        """
                        INSERT INTO document_chunk
                        (id, user_id, conversation_id, attachment_id, filename,
                         content, embedding)
                        VALUES (:id, :user_id, :conversation_id, :attachment_id,
                                :filename, :content, :embedding)
                        """
                    ),
                    {
                        "id": row["id"],
                        "user_id": row["user_id"],
                        "conversation_id": row["conversation_id"],
                        "attachment_id": row["attachment_id"],
                        "filename": row["filename"],
                        "content": row["content"],
                        "embedding": f"[{','.join(map(str, embedding))}]",
                    },
                )
    except Exception:
        pass


def has_documents(session, user_id: str, conversation_id: str) -> bool:
    """Whether this conversation has any indexed chunks to ground against.

    A cheap indexed lookup that lets the chat route skip file-grounding — and,
    crucially, its "Reading your files" stage announcement — on plain chats that
    never had an upload.
    """
    if not is_enabled() or not conversation_id:
        return False
    try:
        with session.bind.connect() as conn:
            return conn.execute(
                text(
                    "SELECT 1 FROM document_chunk "
                    "WHERE user_id = :user_id AND conversation_id = :conversation_id LIMIT 1"
                ),
                {"user_id": user_id, "conversation_id": conversation_id},
            ).first() is not None
    except Exception:
        return False


def retrieve_context(
    session, user_id: str, conversation_id: str, query: str, k: int = MAX_RESULTS
) -> str:
    """Retrieve the most relevant chunks for a conversation and format them.

    Only chunks from the current conversation are used, so answers stay
    grounded in the right files.
    """
    if not is_enabled() or not conversation_id or not query.strip():
        return ""

    # Cheap local check first: skip the embedding API round-trip when this
    # conversation has no indexed chunks (the common case for plain chats).
    try:
        with session.bind.connect() as conn:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM document_chunk "
                    "WHERE user_id = :user_id AND conversation_id = :conversation_id LIMIT 1"
                ),
                {"user_id": user_id, "conversation_id": conversation_id},
            ).first()
    except Exception:
        return ""
    if not exists:
        return ""

    try:
        query_embedding = embed_query(query)
    except Exception:
        return ""
    if not query_embedding:
        return ""

    try:
        with session.bind.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT filename, content
                    FROM document_chunk
                    WHERE user_id = :user_id AND conversation_id = :conversation_id
                    ORDER BY embedding <=> :embedding
                    LIMIT :k
                    """
                ),
                {
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "embedding": f"[{','.join(map(str, query_embedding))}]",
                    "k": k,
                },
            ).fetchall()
    except Exception:
        return ""
    if not rows:
        return ""

    lines = [
        "The user's uploaded files contain this relevant information. "
        "Answer using it as the primary source for these facts and do not "
        "invent details that are not present:"
    ]
    for filename, content in rows:
        lines.append(f"\nFrom '{filename}':\n{content}")
    return "\n".join(lines)


def delete_conversation_chunks(engine, conversation_ids: list[str]) -> None:
    """Remove all chunk rows for the given conversations."""
    if not conversation_ids:
        return
    try:
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM document_chunk WHERE conversation_id = ANY(:ids)"),
                {"ids": conversation_ids},
            )
    except Exception:
        pass