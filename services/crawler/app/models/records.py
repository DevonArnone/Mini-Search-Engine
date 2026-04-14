from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class QueueItem:
    id: int
    url: str
    normalized_url: str
    domain: str
    depth: int
    source_url: str | None
    status: str
    priority: int
    retry_count: int
    source_slug: str | None = None
