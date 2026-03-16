from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

from app.db.connection import db_cursor
from app.extract.parser import ParsedDocument


def compute_boost_score(document: ParsedDocument, depth: int, domain_priority: int = 0) -> int:
    score = 0
    if document.title:
        score += 2
    if document.meta_description:
        score += 1
    if 300 <= document.word_count <= 3000:
        score += 2
    if depth <= 1:
        score += 1
    score += domain_priority
    return score


def upsert_document(url: str, parsed: ParsedDocument, depth: int) -> dict[str, Any]:
    domain = urlparse(url).netloc.lower()
    path = urlparse(url).path or "/"
    boost_score = compute_boost_score(parsed, depth)
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (
                url, canonical_url, domain, path, title, meta_description, language,
                published_at, content_hash, word_count, status, last_crawled_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'indexed', NOW(), NOW())
            ON CONFLICT (url) DO UPDATE SET
                canonical_url = EXCLUDED.canonical_url,
                domain = EXCLUDED.domain,
                path = EXCLUDED.path,
                title = EXCLUDED.title,
                meta_description = EXCLUDED.meta_description,
                language = EXCLUDED.language,
                published_at = EXCLUDED.published_at,
                content_hash = EXCLUDED.content_hash,
                word_count = EXCLUDED.word_count,
                status = 'indexed',
                last_crawled_at = NOW(),
                updated_at = NOW()
            RETURNING id, url
            """,
            (
                url,
                parsed.canonical_url,
                domain,
                path,
                parsed.title,
                parsed.meta_description,
                parsed.language,
                parsed.published_at,
                parsed.content_hash,
                parsed.word_count,
            ),
        )
        record = cur.fetchone()
        cur.execute(
            """
            INSERT INTO document_content (document_id, raw_html, clean_text, headings, links, schema_json)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
            ON CONFLICT (document_id) DO UPDATE SET
                raw_html = EXCLUDED.raw_html,
                clean_text = EXCLUDED.clean_text,
                headings = EXCLUDED.headings,
                links = EXCLUDED.links,
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
        "title": parsed.title,
        "meta_description": parsed.meta_description,
        "headings": parsed.headings,
        "body": parsed.body,
        "language": parsed.language,
        "published_at": parsed.published_at.isoformat() if parsed.published_at else None,
        "word_count": parsed.word_count,
        "tags": parsed.tags,
        "boost_score": boost_score,
        "created_at": None,
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

