from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from app.core.settings import settings


@dataclass(slots=True)
class FetchResult:
    url: str
    status_code: int
    content_type: str
    response_time_ms: int
    body: str


async def fetch_html(url: str) -> FetchResult:
    headers = {"User-Agent": settings.crawler_user_agent}
    start = time.perf_counter()
    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0, headers=headers) as client:
        response = await client.get(url)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    content_type = response.headers.get("content-type", "")
    return FetchResult(
        url=str(response.url),
        status_code=response.status_code,
        content_type=content_type,
        response_time_ms=elapsed_ms,
        body=response.text if "html" in content_type else "",
    )

