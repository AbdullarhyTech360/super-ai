"""Small TTL memo for short-lived network lookups.

Grounding work is per message and repeated verbatim whenever a turn is retried
or edited, so keeping the last few results for a minute or two takes a whole
network round-trip out of the path to the first answer token. Entries expire on
read, and the store is bounded so a long-lived process cannot grow with them.
"""
import threading
import time
from typing import Any


class TtlCache:
    """Key -> value cache whose entries go stale after a fixed age."""

    def __init__(self, ttl_seconds: float, max_entries: int = 128) -> None:
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._entries: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: Any) -> Any | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            stored_at, value = entry
            if time.monotonic() - stored_at > self._ttl:
                del self._entries[key]
                return None
            return value

    def set(self, key: Any, value: Any) -> None:
        with self._lock:
            if key not in self._entries and len(self._entries) >= self._max_entries:
                oldest_key = min(
                    self._entries, key=lambda cached: self._entries[cached][0]
                )
                del self._entries[oldest_key]
            self._entries[key] = (time.monotonic(), value)

    def delete(self, key: Any) -> None:
        """Drop an entry so the next read re-queries: used when the cached
        fact itself changes (a file is indexed, chunks are deleted)."""
        with self._lock:
            self._entries.pop(key, None)
