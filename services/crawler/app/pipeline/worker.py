from __future__ import annotations

import asyncio
import time

from app.core.fetcher import fetch_html
from app.core.queue import (
    dequeue_batch,
    enqueue_url,
    mark_queue_status,
    schedule_queue_retry,
)
from app.core.robots import can_fetch
from app.core.settings import settings
from app.extract.parser import parse_html
from app.indexer.meili import batch_index
from app.pipeline.storage import log_crawl_attempt, upsert_document

_domain_lock = asyncio.Lock()
_next_allowed_fetch_at: dict[str, float] = {}


def compute_retry_delay_seconds(retry_count: int) -> int:
    return min(300, 5 * (2 ** max(0, retry_count - 1)))


def should_retry(status_code: int | None, retry_count: int) -> bool:
    if retry_count >= settings.crawler_max_retries:
        return False
    if status_code is None:
        return True
    return status_code in {408, 425, 429} or status_code >= 500


async def wait_for_domain_slot(domain: str) -> None:
    delay_seconds = settings.crawler_rate_limit_per_domain_ms / 1000
    if delay_seconds <= 0:
        return

    async with _domain_lock:
        now = time.monotonic()
        next_allowed_at = _next_allowed_fetch_at.get(domain, now)
        sleep_for = max(0.0, next_allowed_at - now)
        _next_allowed_fetch_at[domain] = max(now, next_allowed_at) + delay_seconds

    if sleep_for > 0:
        await asyncio.sleep(sleep_for)


def handle_retryable_failure(item, status_code: int | None) -> None:
    next_retry_count = item.retry_count + 1
    if should_retry(status_code, item.retry_count):
        schedule_queue_retry(
            item.id,
            retry_count=next_retry_count,
            delay_seconds=compute_retry_delay_seconds(next_retry_count),
        )
        return
    mark_queue_status(item.id, "failed", next_retry_count)


async def process_queue_item(item) -> None:
    if item.depth > settings.crawler_max_depth:
        mark_queue_status(item.id, "skipped")
        return

    if not settings.crawler_ignore_robots and not can_fetch(item.url):
        log_crawl_attempt(item.url, None, None, None, "blocked by robots.txt")
        mark_queue_status(item.id, "skipped")
        return

    try:
        await wait_for_domain_slot(item.domain)
        result = await fetch_html(item.url)
        log_crawl_attempt(
            item.url,
            result.status_code,
            result.content_type,
            result.response_time_ms,
            None,
        )
        if result.status_code >= 400:
            handle_retryable_failure(item, result.status_code)
            return

        if "html" not in result.content_type:
            mark_queue_status(item.id, "skipped")
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
        handle_retryable_failure(item, None)


async def run_worker() -> None:
    while True:
        items = dequeue_batch(limit=settings.crawler_concurrency)
        if not items:
            break
        await asyncio.gather(*(process_queue_item(item) for item in items))


if __name__ == "__main__":
    asyncio.run(run_worker())
