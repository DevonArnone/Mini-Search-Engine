from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.db.connection import db_cursor
from app.extract.parser import ParsedDocument


def _freshness_status(last_crawled_at: datetime | None) -> str:
    if last_crawled_at is None:
        return "unknown"
    age_days = (datetime.now(tz=timezone.utc) - last_crawled_at.replace(tzinfo=timezone.utc)).days
    if age_days <= 7:
        return "fresh"
    if age_days <= 30:
        return "ok"
    return "stale"


def compute_boost_score(
    document: ParsedDocument,
    depth: int,
    authority_score: float = 0,
) -> int:
    score = 0
    if document.title:
        score += 2
    if document.meta_description:
        score += 1
    if 300 <= document.word_count <= 5000:
        score += 2
    if depth <= 1:
        score += 1
    if document.code_block_count > 0:
        score += 1
    if document.section_path:
        score += 1
    # Fold source authority into boost (scaled to 0-5 range)
    score += min(5, int(authority_score / 2))
    return score


@dataclass(slots=True)
class StoreResult:
    document_id: str
    # "stored": ready to publish. "duplicate": same text as another document.
    outcome: str
    # True when the document was in the index before and must now be removed.
    needs_tombstone: bool = False


def store_document(
    url: str,
    parsed: ParsedDocument,
    depth: int,
    source_slug: str | None = None,
    source_name: str | None = None,
    authority_score: float = 0,
) -> StoreResult:
    """Persist a parsed page under its canonical URL.

    The row is written as `stored`; it becomes `indexed` only after the batch
    containing it has been durably published. A page whose extracted text is
    identical to an existing document is kept as `duplicate` and not indexed.
    """
    domain = urlparse(url).netloc.lower()
    path = urlparse(url).path or "/"
    boost_score = compute_boost_score(parsed, depth, authority_score)
    freshness = _freshness_status(datetime.now(tz=timezone.utc))  # just crawled → fresh

    with db_cursor() as cur:
        # Serialize writers of the same text so two workers cannot both
        # conclude they hold the original.
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (parsed.content_hash,))
        cur.execute(
            """
            SELECT id FROM documents
            WHERE content_hash = %s AND url <> %s AND source_slug IS NOT NULL
              AND status IN ('stored', 'indexed', 'index_failed')
            ORDER BY created_at, id
            LIMIT 1
            """,
            (parsed.content_hash, url),
        )
        original = cur.fetchone()
        cur.execute("SELECT status FROM documents WHERE url = %s", (url,))
        previous = cur.fetchone()
        status = "duplicate" if original else "stored"

        cur.execute(
            """
            INSERT INTO documents (
                url, canonical_url, domain, path,
                source_slug, source_name,
                content_type, section_path,
                title, meta_description, language,
                published_at, last_updated_at,
                content_hash, word_count, code_block_count, tags,
                boost_score, authority_score, freshness_status,
                status, duplicate_of, last_crawled_at, updated_at
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s, %s::jsonb,
                %s, %s, %s,
                %s, %s, NOW(), NOW()
            )
            ON CONFLICT (url) DO UPDATE SET
                canonical_url      = EXCLUDED.canonical_url,
                domain             = EXCLUDED.domain,
                path               = EXCLUDED.path,
                source_slug        = EXCLUDED.source_slug,
                source_name        = EXCLUDED.source_name,
                content_type       = EXCLUDED.content_type,
                section_path       = EXCLUDED.section_path,
                title              = EXCLUDED.title,
                meta_description   = EXCLUDED.meta_description,
                language           = EXCLUDED.language,
                published_at       = EXCLUDED.published_at,
                last_updated_at    = EXCLUDED.last_updated_at,
                content_hash       = EXCLUDED.content_hash,
                word_count         = EXCLUDED.word_count,
                code_block_count   = EXCLUDED.code_block_count,
                tags               = EXCLUDED.tags,
                boost_score        = EXCLUDED.boost_score,
                authority_score    = EXCLUDED.authority_score,
                freshness_status   = EXCLUDED.freshness_status,
                status             = EXCLUDED.status,
                duplicate_of       = EXCLUDED.duplicate_of,
                last_crawled_at    = NOW(),
                updated_at         = NOW()
            RETURNING id
            """,
            (
                url,
                parsed.canonical_url,
                domain,
                path,
                source_slug,
                source_name,
                parsed.content_type,
                parsed.section_path,
                parsed.title,
                parsed.meta_description,
                parsed.language,
                parsed.published_at,
                parsed.last_updated_at,
                parsed.content_hash,
                parsed.word_count,
                parsed.code_block_count,
                json.dumps(parsed.tags),
                boost_score,
                authority_score,
                freshness,
                status,
                original["id"] if original else None,
            ),
        )
        record = cur.fetchone()
        cur.execute(
            """
            INSERT INTO document_content (document_id, raw_html, clean_text, headings, links, schema_json)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
            ON CONFLICT (document_id) DO UPDATE SET
                raw_html    = EXCLUDED.raw_html,
                clean_text  = EXCLUDED.clean_text,
                headings    = EXCLUDED.headings,
                links       = EXCLUDED.links,
                schema_json = EXCLUDED.schema_json
            """,
            (
                record["id"],
                None,
                parsed.body,
                json.dumps(parsed.headings),
                json.dumps(parsed.links),
                json.dumps(parsed.schema_json),
            ),
        )

    was_indexed = bool(previous) and previous["status"] in ("indexed", "index_failed")
    return StoreResult(
        document_id=str(record["id"]),
        outcome=status,
        needs_tombstone=status == "duplicate" and was_indexed,
    )


def document_stored_since(url: str, since: datetime) -> bool:
    """True when this URL was already crawled in the current run."""
    with db_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM documents WHERE url = %s AND last_crawled_at >= %s",
            (url, since.astimezone(timezone.utc).replace(tzinfo=None)),
        )
        return cur.fetchone() is not None


def mark_document_gone(url: str) -> str | None:
    """Flag a document whose page no longer exists. Returns its id if it was indexed."""
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE documents SET status = 'gone', updated_at = NOW()
            WHERE url = %s AND status IN ('stored', 'indexed', 'index_failed')
            RETURNING id
            """,
            (url,),
        )
        row = cur.fetchone()
    return str(row["id"]) if row else None


def log_crawl_attempt(
    url: str,
    status_code: int | None,
    content_type: str | None,
    response_time_ms: int | None,
    error_message: str | None,
) -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO crawl_logs (url, status_code, content_type, response_time_ms, error_message)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (url, status_code, content_type, response_time_ms, error_message),
        )


def update_source_registry(
    slug: str,
    crawl_status: str,
    last_crawled_at: datetime | None = None,
    successful: bool = False,
) -> None:
    """Refresh the source_registry row after a crawl pass."""
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE source_registry
            SET crawl_status    = %s,
                last_crawled_at = COALESCE(%s, last_crawled_at),
                last_successful_crawl_at = CASE
                    WHEN %s THEN COALESCE(%s, NOW())
                    ELSE last_successful_crawl_at
                END,
                doc_count = (
                    SELECT COUNT(*) FROM documents WHERE source_slug = %s AND status = 'indexed'
                ),
                updated_at = NOW()
            WHERE slug = %s
            """,
            (crawl_status, last_crawled_at, successful, last_crawled_at, slug, slug),
        )


def get_source_queue_outcomes(since: datetime) -> dict[str, dict[str, int]]:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT source_slug,
                   COUNT(*) FILTER (WHERE status = 'done')::int AS done,
                   COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                   COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS remaining
            FROM crawl_queue
            WHERE source_slug IS NOT NULL
              AND (
                processed_at >= %s
                OR status IN ('pending', 'processing')
              )
            GROUP BY source_slug
            """,
            (since,),
        )
        return {
            row["source_slug"]: {
                "done": row["done"],
                "failed": row["failed"],
                "remaining": row["remaining"],
            }
            for row in cur.fetchall()
        }
