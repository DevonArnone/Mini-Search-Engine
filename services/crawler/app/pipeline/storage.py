from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
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


def upsert_document(
    url: str,
    parsed: ParsedDocument,
    depth: int,
    source_slug: str | None = None,
    source_name: str | None = None,
    authority_score: float = 0,
) -> dict[str, Any]:
    domain = urlparse(url).netloc.lower()
    path = urlparse(url).path or "/"
    boost_score = compute_boost_score(parsed, depth, authority_score)
    freshness = _freshness_status(datetime.now(tz=timezone.utc))  # just crawled → fresh

    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (
                url, canonical_url, domain, path,
                source_slug, source_name,
                content_type, section_path,
                title, meta_description, language,
                published_at, last_updated_at,
                content_hash, word_count, code_block_count,
                boost_score, authority_score, freshness_status,
                status, last_crawled_at, updated_at
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                'indexed', NOW(), NOW()
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
                boost_score        = EXCLUDED.boost_score,
                authority_score    = EXCLUDED.authority_score,
                freshness_status   = EXCLUDED.freshness_status,
                status             = 'indexed',
                last_crawled_at    = NOW(),
                updated_at         = NOW()
            RETURNING id, url
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
                boost_score,
                authority_score,
                freshness,
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

    return {
        "id": str(record["id"]),
        "url": url,
        "canonical_url": parsed.canonical_url,
        "domain": domain,
        "source_slug": source_slug,
        "source_name": source_name,
        "content_type": parsed.content_type,
        "section_path": parsed.section_path,
        "title": parsed.title,
        "meta_description": parsed.meta_description,
        "headings": parsed.headings,
        "body": parsed.body,
        "language": parsed.language,
        "published_at": parsed.published_at.isoformat() if parsed.published_at else None,
        "last_updated_at": parsed.last_updated_at.isoformat() if parsed.last_updated_at else None,
        "word_count": parsed.word_count,
        "code_block_count": parsed.code_block_count,
        "tags": parsed.tags,
        "boost_score": boost_score,
        "authority_score": authority_score,
        "freshness_status": freshness,
    }


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
) -> None:
    """Refresh the source_registry row after a crawl pass."""
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE source_registry
            SET crawl_status    = %s,
                last_crawled_at = COALESCE(%s, last_crawled_at),
                doc_count = (
                    SELECT COUNT(*) FROM documents WHERE source_slug = %s
                ),
                updated_at = NOW()
            WHERE slug = %s
            """,
            (crawl_status, last_crawled_at, slug, slug),
        )
