import os

import httpx
from dotenv import load_dotenv

# Read the API key the same way rag.py does, so search works even when this
# module is imported before the app has loaded its .env file.
load_dotenv()

SERPER_URL = "https://google.serper.dev/search"
SERPER_API_KEY = os.environ.get("SERPER_API_KEY", "")
# Search runs before the model call, so its timeout is part of the user's wait.
SEARCH_TIMEOUT_SECONDS = float(os.environ.get("SEARCH_TIMEOUT_SECONDS", "3.0"))

_client: httpx.Client | None = None


def _http_client() -> httpx.Client:
    """Reuse one pooled client so each search skips a fresh TLS handshake."""
    global _client
    if _client is None:
        _client = httpx.Client(
            timeout=SEARCH_TIMEOUT_SECONDS,
            limits=httpx.Limits(
                max_connections=16, max_keepalive_connections=8
            ),
        )
    return _client

FACTUAL_KEYWORDS = [
    "who",
    "what",
    "when",
    "where",
    "why",
    "how",
    "latest",
    "news",
    "today",
    "current",
    "now",
    "recent",
    "best",
    "top ",
    "is it true",
    "did ",
    "happened",
    "won",
    "winner",
    "population",
    "date",
    "year",
    "202",
    "203",
    "price",
    "cost",
    "compare",
    "difference between",
    "vs ",
]


def should_search(input_text: str) -> bool:
    """Return True when the prompt looks like a factual/current-events question
    that would benefit from live web grounding."""
    text = input_text.lower().strip()
    if len(text) < 8:
        return False
    import re
    # Match question starters as whole words at the start of the text
    question_starters = (
        r"^(who|what|when|where|why|how)\b"
    )
    if re.match(question_starters, text):
        return True
    # For remaining keywords, require them as whole words
    # to avoid false positives like "how" in "hello how are you"
    word_boundary_keywords = (
        "latest", "news", "today", "current", "recent",
        "best", "top ", "population", "price", "cost",
        "compare", "difference between", "vs ",
    )
    if any(kw in text for kw in word_boundary_keywords):
        return True
    # These need word-boundary matching to avoid false positives
    phrase_keywords = (
        (r"\bis it true\b", "is it true"),
        (r"\bdid\b", "did "),
        (r"\bhappened\b", "happened"),
        (r"\bwon\b", "won"),
        (r"\bwinner\b", "winner"),
        (r"\bnow\b", "now"),
        (r"\bdate\b", "date"),
        (r"\byear\b", "year"),
        (r"202\d", "202"),
        (r"203\d", "203"),
    )
    for pattern, _ in phrase_keywords:
        if re.search(pattern, text):
            return True
    return False


def search_web(query: str, num_results: int = 5) -> list[dict]:
    """Run a web search via Serper.dev and return top organic results.

    Returns a list of dicts with keys: title, url, snippet. Returns [] when no
    API key is configured or when the request fails (callers must degrade
    gracefully).
    """
    if not SERPER_API_KEY:
        return []

    payload = {
        "q": query,
        "gl": "us",
        "hl": "en",
        "num": num_results,
    }
    headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
    }
    try:
        # Short timeout: search grounding must never stall the chat stream.
        resp = _http_client().post(SERPER_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("organic", []):
        results.append(
            {
                "title": item.get("title", ""),
                "url": item.get("link", ""),
                "snippet": item.get("snippet", ""),
            }
        )
    return results[:num_results]


def format_results(results: list[dict], limit: int = 5) -> str:
    """Format search results into a compact grounding context block."""
    if not results:
        return ""
    lines = [
        "You may use the following web search results to ground your answer. "
        "Prefer these sources for facts, cite the source URL when you use them, "
        "and say 'I could not verify this' if the results do not cover the question."
    ]
    for idx, result in enumerate(results[:limit], start=1):
        snippet = result.get("snippet", "").strip()
        title = result.get("title", "")
        url = result.get("url", "")
        lines.append(f"{idx}. {title}\n   {snippet}\n   Source: {url}")
    return "\n".join(lines)