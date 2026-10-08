from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from app.core.settings import settings

MAX_BODY_BYTES = 5_000_000

_client: httpx.AsyncClient | None = None


@dataclass(slots=True)
class FetchResult:
    url: str
    status_code: int
    content_type: str
    response_time_ms: int
    body: str


def get_client() -> httpx.AsyncClient:
    """One client for the whole crawl, so connections to each site are reused."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=15.0,
            headers={
                "User-Agent": settings.crawler_user_agent,
                # Some documentation sites negotiate Markdown unless HTML is asked for.
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            },
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def fetch_html(url: str) -> FetchResult:
    start = time.perf_counter()
    response = await get_client().get(url)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    content_type = response.headers.get("content-type", "")
    is_html = "html" in content_type and len(response.content) <= MAX_BODY_BYTES
    return FetchResult(
        url=str(response.url),
        status_code=response.status_code,
        content_type=content_type,
        response_time_ms=elapsed_ms,
        body=response.text if is_html else "",
    )
