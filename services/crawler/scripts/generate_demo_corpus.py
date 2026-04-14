from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from itertools import islice
from pathlib import Path, PurePosixPath
from typing import Iterable
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.connection import get_connection
from app.indexer.meili import batch_index


DOMAINS = (
    "docs.synthetic.local",
    "blog.synthetic.local",
    "kb.synthetic.local",
    "guides.synthetic.local",
)

TOPICS = (
    "search-ranking",
    "crawler-design",
    "index-maintenance",
    "frontend-search",
    "analytics-pipelines",
    "retrieval-tuning",
    "deduplication",
    "metadata-storage",
)

TOPIC_TAGS = {
    "search-ranking": ["ranking", "relevance", "meilisearch"],
    "crawler-design": ["crawler", "python", "queues"],
    "index-maintenance": ["indexing", "etl", "operations"],
    "frontend-search": ["nextjs", "typescript", "ux"],
    "analytics-pipelines": ["analytics", "postgres", "metrics"],
    "retrieval-tuning": ["search", "latency", "performance"],
    "deduplication": ["content", "hashing", "quality"],
    "metadata-storage": ["postgres", "schema", "storage"],
}

LANGUAGES = ("en", "en", "en", "es")
BASE_PUBLISHED_AT = datetime(2025, 1, 1, tzinfo=timezone.utc)


def batched(values: Iterable[int], size: int) -> Iterable[list[int]]:
    iterator = iter(values)
    while batch := list(islice(iterator, size)):
        yield batch


def build_clean_text(doc_number: int, topic: str, domain: str) -> str:
    topic_label = topic.replace("-", " ")
    paragraphs = [
        f"Document {doc_number} covers {topic_label} for the {domain} corpus.",
        "It describes how a crawler fetches source pages, extracts clean text, and stores metadata for retrieval.",
        "The pipeline writes canonical URLs, language signals, publication dates, and search attributes into PostgreSQL.",
        "A Meilisearch index serves autocomplete, faceted filtering, and ranked result retrieval for a Next.js frontend.",
        "Synthetic content is useful for local benchmarking because it produces a stable document count without bloating the repository.",
        "Each generated document includes headings, tags, and a realistic body length so search snippets and filters behave predictably.",
    ]
    return " ".join(paragraphs)


def build_document(doc_number: int) -> tuple[tuple, tuple, dict[str, object]]:
    topic = TOPICS[(doc_number - 1) % len(TOPICS)]
    domain = DOMAINS[(doc_number - 1) % len(DOMAINS)]
    language = LANGUAGES[(doc_number - 1) % len(LANGUAGES)]
    tags = TOPIC_TAGS[topic]
    slug = f"doc-{doc_number:05d}"
    path = str(PurePosixPath("/") / topic / slug)
    url = f"https://{domain}{path}"
    title = f"{topic.replace('-', ' ').title()} Reference {doc_number}"
    description = (
        f"Synthetic search document {doc_number} focused on {topic.replace('-', ' ')}."
    )
    headings = [
        title,
        f"{topic.replace('-', ' ').title()} workflow",
        "Indexing notes",
    ]
    links = [f"https://{domain}/{topic}/overview"]
    clean_text = build_clean_text(doc_number, topic, domain)
    content_hash = sha256(clean_text.encode("utf-8")).hexdigest()
    published_at = BASE_PUBLISHED_AT + timedelta(days=doc_number % 365)
    boost_score = 6 + (doc_number % 5)
    document_id = str(uuid4())

    document_row = (
        document_id,
        url,
        url,
        domain,
        path,
        title,
        description,
        language,
        published_at,
        content_hash,
        len(clean_text.split()),
        "indexed",
    )
    content_row = (
        document_id,
        None,
        clean_text,
        json.dumps(headings),
        json.dumps(links),
        json.dumps({"@type": "TechArticle", "keywords": tags}),
    )
    index_document = {
        "id": document_id,
        "url": url,
        "canonical_url": url,
        "domain": domain,
        "title": title,
        "meta_description": description,
        "headings": headings,
        "body": clean_text,
        "language": language,
        "published_at": published_at.isoformat(),
        "word_count": len(clean_text.split()),
        "tags": tags,
        "boost_score": boost_score,
    }
    return document_row, content_row, index_document


def seed_demo_corpus(count: int, start_at: int, batch_size: int) -> None:
    document_numbers = range(start_at, start_at + count)
    with get_connection() as conn:
        with conn.cursor() as cur:
            for batch in batched(document_numbers, batch_size):
                document_rows = []
                content_rows = []
                index_documents = []

                for doc_number in batch:
                    document_row, content_row, index_document = build_document(doc_number)
                    document_rows.append(document_row)
                    content_rows.append(content_row)
                    index_documents.append(index_document)

                cur.executemany(
                    """
                    INSERT INTO documents (
                        id, url, canonical_url, domain, path, title, meta_description, language,
                        published_at, content_hash, word_count, status, last_crawled_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
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
                        status = EXCLUDED.status,
                        last_crawled_at = NOW(),
                        updated_at = NOW()
                    """,
                    document_rows,
                )

                urls = [row[1] for row in document_rows]
                cur.execute(
                    """
                    SELECT id, url
                    FROM documents
                    WHERE url = ANY(%s)
                    """,
                    (urls,),
                )
                url_to_id = {row["url"]: str(row["id"]) for row in cur.fetchall()}

                resolved_content_rows = []
                resolved_index_documents = []
                for document_row, content_row, index_document in zip(
                    document_rows, content_rows, index_documents, strict=True
                ):
                    url = document_row[1]
                    document_id = url_to_id[url]
                    resolved_content_rows.append((document_id, *content_row[1:]))
                    resolved_index_documents.append({**index_document, "id": document_id})

                cur.executemany(
                    """
                    INSERT INTO document_content (
                        document_id, raw_html, clean_text, headings, links, schema_json
                    )
                    VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                    ON CONFLICT (document_id) DO UPDATE SET
                        raw_html = EXCLUDED.raw_html,
                        clean_text = EXCLUDED.clean_text,
                        headings = EXCLUDED.headings,
                        links = EXCLUDED.links,
                        schema_json = EXCLUDED.schema_json
                    """,
                    resolved_content_rows,
                )
                conn.commit()
                batch_index(resolved_index_documents)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a synthetic local corpus for search demos and benchmarks."
    )
    parser.add_argument(
        "--count",
        type=int,
        default=10_000,
        help="Number of synthetic documents to create.",
    )
    parser.add_argument(
        "--start-at",
        type=int,
        default=1,
        help="Starting document number. Reuse 1 to upsert the same corpus.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Batch size for PostgreSQL and Meilisearch writes.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.count < 1:
        raise SystemExit("--count must be greater than 0")
    if args.start_at < 1:
        raise SystemExit("--start-at must be greater than 0")
    if args.batch_size < 1:
        raise SystemExit("--batch-size must be greater than 0")

    seed_demo_corpus(count=args.count, start_at=args.start_at, batch_size=args.batch_size)
    end_at = args.start_at + args.count - 1
    print(
        "Seeded synthetic corpus "
        f"for documents {args.start_at} through {end_at} ({args.count} total)."
    )


if __name__ == "__main__":
    main()
