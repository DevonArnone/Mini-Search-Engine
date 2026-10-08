from __future__ import annotations

from typing import Any

from app.db.connection import db_cursor
from app.models.records import QueueItem
from app.utils.url import extract_domain, normalize_url


_ENQUEUE_SQL = """
    INSERT INTO crawl_queue (url, normalized_url, domain, depth, source_url, priority, source_slug)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (normalized_url) DO UPDATE SET
        source_slug = COALESCE(crawl_queue.source_slug, EXCLUDED.source_slug),
        depth = LEAST(crawl_queue.depth, EXCLUDED.depth),
        priority = LEAST(crawl_queue.priority, EXCLUDED.priority),
        status = CASE
            WHEN crawl_queue.source_slug IS NULL AND EXCLUDED.source_slug IS NOT NULL
            THEN 'pending'
            ELSE crawl_queue.status
        END,
        scheduled_at = CASE
            WHEN crawl_queue.source_slug IS NULL AND EXCLUDED.source_slug IS NOT NULL
            THEN NOW()
            ELSE crawl_queue.scheduled_at
        END,
        processed_at = CASE
            WHEN crawl_queue.source_slug IS NULL AND EXCLUDED.source_slug IS NOT NULL
            THEN NULL
            ELSE crawl_queue.processed_at
        END
"""


def _enqueue_row(url: str, depth: int, source_url: str | None, priority: int, source_slug: str | None) -> tuple:
    normalized_url = normalize_url(url)
    return (url, normalized_url, extract_domain(normalized_url), depth, source_url, priority, source_slug)


def enqueue_url(
    url: str,
    depth: int = 0,
    source_url: str | None = None,
    priority: int = 100,
    source_slug: str | None = None,
) -> None:
    with db_cursor() as cur:
        cur.execute(_ENQUEUE_SQL, _enqueue_row(url, depth, source_url, priority, source_slug))


def enqueue_urls(
    urls: list[str],
    depth: int = 0,
    source_url: str | None = None,
    priority: int = 100,
    source_slug: str | None = None,
) -> None:
    """Enqueue many URLs in one transaction."""
    if not urls:
        return
    # Two spellings of one page would collide inside a single statement batch.
    rows = {row[1]: row for row in (_enqueue_row(url, depth, source_url, priority, source_slug) for url in urls)}
    with db_cursor() as cur:
        cur.executemany(_ENQUEUE_SQL, list(rows.values()))


def reset_queue_for_recrawl(source_slugs: list[str]) -> int:
    """Make every finished item of these sources due again for a fresh crawl."""
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE crawl_queue
            SET status = 'pending', retry_count = 0, scheduled_at = NOW(), processed_at = NULL, detail = NULL
            WHERE source_slug = ANY(%s) AND status <> 'pending'
            """,
            (source_slugs,),
        )
        return cur.rowcount


def dequeue_batch(limit: int = 10, per_domain: int | None = None) -> list[QueueItem]:
    """Claim due items, taking one from every site before a second from any.

    Each site is rate limited independently, so spreading a batch across
    sites keeps every source moving instead of queueing behind the largest.
    When only one site has work left the whole batch comes from it, and its
    requests are still spaced by that site's rate limit.
    """
    per_domain = limit if per_domain is None else per_domain
    with db_cursor() as cur:
        cur.execute(
            """
            WITH ranked AS (
                SELECT id, priority, scheduled_at,
                       ROW_NUMBER() OVER (PARTITION BY domain ORDER BY priority, scheduled_at, id) AS position
                FROM crawl_queue
                WHERE status = 'pending' AND scheduled_at <= NOW()
            ), next_items AS (
                SELECT q.id
                FROM crawl_queue q
                JOIN ranked r ON r.id = q.id
                WHERE r.position <= %s
                ORDER BY r.position, r.priority, r.scheduled_at
                LIMIT %s
                FOR UPDATE OF q SKIP LOCKED
            )
            UPDATE crawl_queue
            SET status = 'processing'
            WHERE id IN (SELECT id FROM next_items) AND status = 'pending'
            RETURNING id, url, normalized_url, domain, depth, source_url, status,
                      priority, retry_count, source_slug
            """,
            (per_domain, limit),
        )
        rows = cur.fetchall()
    return [QueueItem(**row) for row in rows]


def seconds_until_next_due() -> float | None:
    """Seconds until the earliest scheduled retry, or None when nothing is pending."""
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT EXTRACT(EPOCH FROM (MIN(scheduled_at) - NOW()))::float AS wait
            FROM crawl_queue WHERE status = 'pending'
            """
        )
        row = cur.fetchone()
    return None if row is None or row["wait"] is None else max(0.0, row["wait"])


def requeue_stale_processing(max_age_minutes: int = 30) -> int:
    """Recover queue items left processing after an interrupted worker."""
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE crawl_queue
            SET status = 'pending', scheduled_at = NOW(), processed_at = NULL
            WHERE status = 'processing'
              AND scheduled_at < NOW() - (%s * INTERVAL '1 minute')
            """,
            (max_age_minutes,),
        )
        return cur.rowcount


def mark_queue_status(
    queue_id: int, status: str, retry_count: int | None = None, detail: str | None = None
) -> None:
    assignments = ["status = %s", "processed_at = NOW()", "detail = %s"]
    values: list[Any] = [status, detail]
    if retry_count is not None:
        assignments.append("retry_count = %s")
        values.append(retry_count)
    values.append(queue_id)
    query = f"UPDATE crawl_queue SET {', '.join(assignments)} WHERE id = %s"
    with db_cursor() as cur:
        cur.execute(query, tuple(values))


def schedule_queue_retry(queue_id: int, retry_count: int, delay_seconds: int) -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE crawl_queue
            SET status = 'pending',
                retry_count = %s,
                scheduled_at = NOW() + %s * INTERVAL '1 second',
                processed_at = NULL
            WHERE id = %s
            """,
            (retry_count, delay_seconds, queue_id),
        )
