from __future__ import annotations

from typing import Any

from app.db.connection import db_cursor
from app.models.records import QueueItem
from app.utils.url import extract_domain, normalize_url


def enqueue_url(
    url: str,
    depth: int = 0,
    source_url: str | None = None,
    priority: int = 100,
    source_slug: str | None = None,
) -> None:
    normalized_url = normalize_url(url)
    domain = extract_domain(normalized_url)
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO crawl_queue (url, normalized_url, domain, depth, source_url, priority, source_slug)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (normalized_url) DO NOTHING
            """,
            (url, normalized_url, domain, depth, source_url, priority, source_slug),
        )


def dequeue_batch(limit: int = 10) -> list[QueueItem]:
    with db_cursor() as cur:
        cur.execute(
            """
            WITH next_items AS (
                SELECT id
                FROM crawl_queue
                WHERE status = 'pending' AND scheduled_at <= NOW()
                ORDER BY priority ASC, scheduled_at ASC
                LIMIT %s
                FOR UPDATE SKIP LOCKED
            )
            UPDATE crawl_queue
            SET status = 'processing'
            WHERE id IN (SELECT id FROM next_items)
            RETURNING id, url, normalized_url, domain, depth, source_url, status,
                      priority, retry_count, source_slug
            """,
            (limit,),
        )
        rows = cur.fetchall()
    return [QueueItem(**row) for row in rows]


def mark_queue_status(queue_id: int, status: str, retry_count: int | None = None) -> None:
    assignments = ["status = %s", "processed_at = NOW()"]
    values: list[Any] = [status]
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
