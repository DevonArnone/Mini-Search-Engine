from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime, timezone

from app.core.fetcher import fetch_html
from app.core.queue import (
    dequeue_batch,
    enqueue_urls,
    mark_queue_status,
    schedule_queue_retry,
    seconds_until_next_due,
)
from app.core.robots import can_fetch
from app.core.settings import settings
from app.extract.parser import parse_html
from app.indexer.publisher import BatchPublisher
from app.pipeline.storage import (
    document_stored_since,
    log_crawl_attempt,
    mark_document_gone,
    store_document,
)
from app.utils.url import canonical_document_url, in_scope, normalize_url

# Longest the worker will wait for a scheduled retry before finishing the run.
MAX_RETRY_WAIT_SECONDS = 330
MAX_LINKS_PER_PAGE = 500

# Normalized URLs already enqueued by this process. Navigation repeats the
# same links on every page; this keeps them from reaching PostgreSQL again.
_enqueued_this_run: set[str] = set()

_domain_lock = asyncio.Lock()
_next_allowed_fetch_at: dict[str, float] = {}

# Source registry cache: slug -> {name, authority_weight}
_source_registry: dict[str, dict] = {}


def cap_source_max_depth(source_max_depth: int | None, global_max_depth: int) -> int:
    configured_depth = global_max_depth if source_max_depth is None else int(source_max_depth)
    return min(configured_depth, global_max_depth)


def should_discover_links(current_depth: int, max_depth: int) -> bool:
    return current_depth < max_depth


def register_sources(sources: list[dict]) -> None:
    """Populate the in-memory source registry before the worker runs."""
    for source in sources:
        slug = source.get("slug", "")
        if slug:
            _source_registry[slug] = {
                "name": source.get("name", slug),
                "authority_weight": float(source.get("authority_weight", 5)),
                "allowed_domains": tuple(source.get("allowed_domains", [])),
                "max_depth": cap_source_max_depth(
                    source.get("max_depth"), settings.crawler_max_depth
                ),
                "rate_limit_per_domain_ms": int(
                    source.get("rate_limit_per_domain_ms", settings.crawler_rate_limit_per_domain_ms)
                ),
                "include_path_prefixes": tuple(source.get("include_path_prefixes", [])),
                "exclude_path_patterns": tuple(
                    re.compile(pattern) for pattern in source.get("exclude_path_patterns", [])
                ),
            }


def source_scope(source_info: dict) -> tuple[tuple[str, ...], tuple[str, ...], tuple[re.Pattern[str], ...]]:
    return (
        tuple(source_info.get("allowed_domains") or settings.crawler_allowed_domains),
        tuple(source_info.get("include_path_prefixes", ())),
        tuple(source_info.get("exclude_path_patterns", ())),
    )


def compute_retry_delay_seconds(retry_count: int) -> int:
    return min(300, 5 * (2 ** max(0, retry_count - 1)))


def should_retry(status_code: int | None, retry_count: int) -> bool:
    if retry_count >= settings.crawler_max_retries:
        return False
    if status_code is None:
        return True
    return status_code in {408, 425, 429} or status_code >= 500


async def wait_for_domain_slot(domain: str, delay_ms: int | None = None) -> None:
    delay_seconds = (settings.crawler_rate_limit_per_domain_ms if delay_ms is None else delay_ms) / 1000
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


async def process_queue_item(item, publisher: BatchPublisher, run_started_at: datetime) -> None:
    """Fetch, parse, store, and hand one page to the index publisher.

    Everything that blocks (robots, PostgreSQL, HTML parsing) runs in worker
    threads so the event loop stays free for other fetches.
    """
    source_slug = item.source_slug
    source_info = _source_registry.get(source_slug, {}) if source_slug else {}
    source_name = source_info.get("name")
    authority_score = source_info.get("authority_weight", 0)
    max_depth = int(source_info.get("max_depth", settings.crawler_max_depth))
    allowed_domains, include_prefixes, exclude_patterns = source_scope(source_info)

    async def finish(status: str, detail: str | None = None) -> None:
        await asyncio.to_thread(mark_queue_status, item.id, status, None, detail)

    if item.depth > max_depth:
        await finish("skipped", "depth")
        return
    if not in_scope(item.url, allowed_domains, include_prefixes, exclude_patterns):
        await finish("skipped", "out_of_scope")
        return
    if not settings.crawler_ignore_robots and not await asyncio.to_thread(can_fetch, item.url):
        await asyncio.to_thread(log_crawl_attempt, item.url, None, None, None, "blocked by robots.txt")
        await finish("skipped", "robots")
        return
    # Another address for this page may already have stored it under this URL.
    if await asyncio.to_thread(document_stored_since, item.normalized_url, run_started_at):
        await finish("duplicate", "canonical")
        return

    try:
        await wait_for_domain_slot(item.domain, int(source_info.get("rate_limit_per_domain_ms", settings.crawler_rate_limit_per_domain_ms)))
        result = await fetch_html(item.url)
        await asyncio.to_thread(
            log_crawl_attempt, item.url, result.status_code, result.content_type, result.response_time_ms, None
        )
        if result.status_code in (404, 410):
            gone_id = await asyncio.to_thread(mark_document_gone, item.normalized_url)
            if gone_id:
                await publisher.submit_delete(gone_id)
            await asyncio.to_thread(mark_queue_status, item.id, "failed", item.retry_count, "gone")
            return
        if result.status_code >= 400:
            await asyncio.to_thread(handle_retryable_failure, item, result.status_code)
            return
        if "html" not in result.content_type or not result.body:
            await finish("skipped", "not_html")
            return
        # A redirect can leave the source's boundaries.
        if not in_scope(result.url, allowed_domains, include_prefixes, exclude_patterns):
            await finish("skipped", "redirected_out_of_scope")
            return

        parsed = await asyncio.to_thread(parse_html, result.url, result.body, source_slug)
        if parsed.word_count < settings.crawler_min_words:
            await finish("skipped", "thin")
            return

        document_url = canonical_document_url(result.url, parsed.canonical_url, allowed_domains)
        if not in_scope(document_url, allowed_domains, include_prefixes, exclude_patterns):
            document_url = normalize_url(result.url)
        if document_url != item.normalized_url and await asyncio.to_thread(
            document_stored_since, document_url, run_started_at
        ):
            await finish("duplicate", "canonical")
            return

        stored = await asyncio.to_thread(
            store_document,
            document_url,
            parsed,
            item.depth,
            source_slug,
            source_name,
            authority_score,
        )
        if stored.outcome == "stored":
            # Blocks when the publisher is behind, which paces the crawl.
            await publisher.submit(stored.document_id)
        elif stored.needs_tombstone:
            await publisher.submit_delete(stored.document_id)

        if should_discover_links(item.depth, max_depth):
            fresh: list[str] = []
            for link in parsed.links:
                normalized = normalize_url(link)
                if normalized in _enqueued_this_run:
                    continue
                if not in_scope(normalized, allowed_domains, include_prefixes, exclude_patterns):
                    continue
                _enqueued_this_run.add(normalized)
                fresh.append(normalized)
                if len(fresh) >= MAX_LINKS_PER_PAGE:
                    break
            await asyncio.to_thread(enqueue_urls, fresh, item.depth + 1, result.url, 100, source_slug)

        if stored.outcome == "duplicate":
            await finish("duplicate", "content")
        else:
            await finish("done")
    except Exception as exc:  # noqa: BLE001 - one bad page must not stop the crawl
        await asyncio.to_thread(log_crawl_attempt, item.url, None, None, None, str(exc)[:500])
        await asyncio.to_thread(handle_retryable_failure, item, None)


async def run_worker(
    stop_event: asyncio.Event | None = None,
    publisher: BatchPublisher | None = None,
    run_started_at: datetime | None = None,
) -> None:
    owns_publisher = publisher is None
    publisher = publisher or BatchPublisher()
    publisher.start()
    run_started_at = run_started_at or datetime.now(tz=timezone.utc)
    try:
        while not (stop_event and stop_event.is_set()):
            items = await asyncio.to_thread(dequeue_batch, settings.crawler_concurrency)
            if not items:
                # Retries are scheduled into the future; wait for the next one
                # instead of ending the run with work still pending.
                wait = await asyncio.to_thread(seconds_until_next_due)
                if wait is None or wait > MAX_RETRY_WAIT_SECONDS:
                    break
                try:
                    if stop_event:
                        await asyncio.wait_for(stop_event.wait(), timeout=wait + 0.5)
                    else:
                        await asyncio.sleep(wait + 0.5)
                except asyncio.TimeoutError:
                    pass
                continue
            await asyncio.gather(*(process_queue_item(item, publisher, run_started_at) for item in items))
    finally:
        if owns_publisher:
            await publisher.close()


if __name__ == "__main__":
    asyncio.run(run_worker())
