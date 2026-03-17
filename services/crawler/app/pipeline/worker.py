from __future__ import annotations

import asyncio

from app.core.fetcher import fetch_html
from app.core.queue import dequeue_batch, enqueue_url, mark_queue_status
from app.core.robots import can_fetch
from app.core.settings import settings
from app.extract.parser import parse_html
from app.indexer.meili import batch_index
from app.pipeline.storage import log_crawl_attempt, upsert_document


async def process_queue_item(item) -> None:
    if item.depth > settings.crawler_max_depth:
        mark_queue_status(item.id, "skipped")
        return

    if not settings.crawler_ignore_robots and not can_fetch(item.url):
        log_crawl_attempt(item.url, None, None, None, "blocked by robots.txt")
        mark_queue_status(item.id, "skipped")
        return

    try:
        result = await fetch_html(item.url)
        log_crawl_attempt(
            item.url,
            result.status_code,
            result.content_type,
            result.response_time_ms,
            None,
        )
        if result.status_code >= 400 or "html" not in result.content_type:
            mark_queue_status(item.id, "failed", item.retry_count + 1)
            return

        parsed = parse_html(result.url, result.body)
        indexed_document = upsert_document(result.url, parsed, item.depth)
        batch_index([indexed_document])
        for link in parsed.links[:50]:
            if any(link.startswith(f"http://{domain}") or link.startswith(f"https://{domain}") for domain in settings.crawler_allowed_domains):
                enqueue_url(link, depth=item.depth + 1, source_url=result.url)
        mark_queue_status(item.id, "done")
    except Exception as exc:
        log_crawl_attempt(item.url, None, None, None, str(exc))
        mark_queue_status(item.id, "failed", item.retry_count + 1)


async def run_worker() -> None:
    while True:
        items = dequeue_batch(limit=settings.crawler_concurrency)
        if not items:
            break
        await asyncio.gather(*(process_queue_item(item) for item in items))


if __name__ == "__main__":
    asyncio.run(run_worker())
