import os

import httpx
from dotenv import load_dotenv

from app.services.ttl_cache import TtlCache

# Read the API key the same way rag.py does, so search works even when this
# module is imported before the app has loaded its .env file.
load_dotenv()

SERPER_URL = "https://google.serper.dev/search"
SERPER_API_KEY = os.environ.get("SERPER_API_KEY", "")
# Search runs before the model call, so its timeout is part of the user's wait.
SEARCH_TIMEOUT_SECONDS = float(os.environ.get("SEARCH_TIMEOUT_SECONDS", "1.8"))
# Repeated questions within this window reuse their results instead of paying
# for the lookup again (retries, edit-and-resend, a reloaded page).
SEARCH_CACHE_SECONDS = float(os.environ.get("SEARCH_CACHE_SECONDS", "120"))

_client: httpx.Client | None = None
_search_cache = TtlCache(SEARCH_CACHE_SECONDS)


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
    that would benefit from live web grounding.

    Deliberately narrow: the search is a blocking round-trip in front of the
    model, so a keyword that fires on ordinary questions charges every chat for
    a lookup it did not need.
    """
    text = input_text.lower().strip()
    if len(text) < 8:
        return False
    import re
    # Match question starters as whole words at the start of the text
    question_starters = (
        r"^(who|what|when|where|why)\b"
    )
    if re.match(question_starters, text):
        return True
    # "how" alone is almost always a request for explanation or instructions,
    # which the model answers from itself; only its factual compounds count.
    if re.match(r"^how\s+(much|many|long|far)\b", text):
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

    cache_key = (query, num_results)
    cached = _search_cache.get(cache_key)
    if cached is not None:
        return cached

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
    results = results[:num_results]
    # Empty results usually mean a provider hiccup, and caching that would
    # blind the next turn to a search that would have worked.
    if results:
        _search_cache.set(cache_key, results)
    return results


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