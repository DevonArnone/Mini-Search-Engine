"""Builds index documents from PostgreSQL, the source of truth for the index."""

from __future__ import annotations

from typing import Any, Iterator

from app.db.connection import db_cursor, get_connection

# Statuses whose documents belong in the search index.
INDEXABLE_STATUSES = ("stored", "indexed", "index_failed")

_SELECT = """
    SELECT d.id, d.url, d.canonical_url, d.domain, d.source_slug, d.source_name,
           d.content_type, d.section_path, d.title, d.meta_description, d.language,
           d.published_at, d.last_updated_at, d.word_count, d.code_block_count,
           d.tags, d.boost_score, d.authority_score, d.freshness_status,
           c.clean_text, c.headings
    FROM documents d
    JOIN document_content c ON c.document_id = d.id
"""


def to_index_document(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "url": row["url"],
        "canonical_url": row["canonical_url"],
        "domain": row["domain"],
        "source_slug": row["source_slug"],
        "source_name": row["source_name"],
        "content_type": row["content_type"],
        "section_path": row["section_path"],
        "title": row["title"],
        "meta_description": row["meta_description"],
        "headings": list(row["headings"] or []),
        "body": row["clean_text"] or "",
        "language": row["language"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "last_updated_at": row["last_updated_at"].isoformat() if row["last_updated_at"] else None,
        "word_count": row["word_count"],
        "code_block_count": row["code_block_count"],
        "tags": list(row["tags"] or []),
        "boost_score": row["boost_score"],
        "authority_score": row["authority_score"],
        "freshness_status": row["freshness_status"],
    }


def load_index_documents(document_ids: list[str]) -> list[dict[str, Any]]:
    """Index documents for the given ids, skipping any no longer indexable."""
    if not document_ids:
        return []
    with db_cursor() as cur:
        cur.execute(
            _SELECT + " WHERE d.id = ANY(%s::uuid[]) AND d.status = ANY(%s)",
            (document_ids, list(INDEXABLE_STATUSES)),
        )
        by_id = {str(row["id"]): to_index_document(row) for row in cur.fetchall()}
    return [by_id[document_id] for document_id in document_ids if document_id in by_id]


def stream_index_documents(
    source_slugs: list[str] | None = None,
    limit: int | None = None,
    fetch_size: int = 250,
) -> Iterator[dict[str, Any]]:
    """Stream every indexable crawled document through a server-side cursor.

    Ordering by a hash of the id is stable across runs and unrelated to crawl
    order, so `limit` selects a deterministic sample for benchmark corpora.
    Synthetic fixture rows (no source) are never exported.
    """
    query = _SELECT + " WHERE d.status = ANY(%s) AND d.source_slug IS NOT NULL"
    params: list[Any] = [list(INDEXABLE_STATUSES)]
    if source_slugs:
        query += " AND d.source_slug = ANY(%s)"
        params.append(source_slugs)
    query += " ORDER BY md5(d.id::text), d.id"
    if limit is not None:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor(name="index_export") as cur:
            cur.itersize = fetch_size
            cur.execute(query, params)
            for row in cur:
                yield to_index_document(row)


def pending_document_ids() -> list[str]:
    """Documents stored in PostgreSQL but not yet durably published."""
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id FROM documents
            WHERE status IN ('stored', 'index_failed') AND source_slug IS NOT NULL
            ORDER BY updated_at, id
            """
        )
        return [str(row["id"]) for row in cur.fetchall()]


def mark_documents_indexed(document_ids: list[str]) -> None:
    if not document_ids:
        return
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE documents
            SET status = 'indexed', index_published_at = NOW(), updated_at = NOW()
            WHERE id = ANY(%s::uuid[]) AND status IN ('stored', 'index_failed', 'indexed')
            """,
            (document_ids,),
        )


def mark_documents_index_failed(document_ids: list[str]) -> None:
    if not document_ids:
        return
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE documents SET status = 'index_failed', updated_at = NOW()
            WHERE id = ANY(%s::uuid[]) AND status = 'stored'
            """,
            (document_ids,),
        )
