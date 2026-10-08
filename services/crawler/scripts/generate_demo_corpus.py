"""Generate the deterministic synthetic index fixture.

This is test data, not a crawl. It exists so integration tests and local
experiments have a fixed 10K-document index whose contents never change.
It is written to its own index directory, touches neither PostgreSQL nor the
real index, and every document is labeled as synthetic. It must not be used
as evidence of crawl scale.

    python scripts/generate_demo_corpus.py --count 10000
    SEARCH_INDEX_DIR=data/search-index-synthetic npm run start
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from typing import Iterator
from uuid import NAMESPACE_URL, uuid5

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.indexer.native import NativeIndexWriter, upsert_operation

DEFAULT_OUT = Path(__file__).resolve().parents[3] / "data" / "search-index-synthetic"

SOURCE_SLUG = "synthetic"
SOURCE_NAME = "Synthetic fixture"

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
    "search-ranking": ["ranking", "relevance", "bm25"],
    "crawler-design": ["crawler", "python", "queues"],
    "index-maintenance": ["indexing", "etl", "operations"],
    "frontend-search": ["nextjs", "typescript", "ux"],
    "analytics-pipelines": ["analytics", "postgres", "metrics"],
    "retrieval-tuning": ["search", "latency", "performance"],
    "deduplication": ["content", "hashing", "quality"],
    "metadata-storage": ["postgres", "schema", "storage"],
}

CONTENT_TYPES = ("guide", "reference", "tutorial")
LANGUAGES = ("en", "en", "en", "es")
BASE_PUBLISHED_AT = datetime(2025, 1, 1, tzinfo=timezone.utc)


def build_body(doc_number: int, topic: str, domain: str) -> str:
    topic_label = topic.replace("-", " ")
    return " ".join(
        [
            f"Synthetic document {doc_number} covers {topic_label} for the {domain} fixture.",
            "It describes how a crawler fetches source pages, extracts clean text, and stores metadata for retrieval.",
            "The pipeline writes canonical URLs, language signals, publication dates, and search attributes into PostgreSQL.",
            "An inverted index serves autocomplete, faceted filtering, and BM25-ranked retrieval for a Next.js frontend.",
            "Generated content gives tests a stable document count without storing a corpus in the repository.",
            "Each generated document includes headings, tags, and a fixed body length so snippets and filters behave predictably.",
        ]
    )


def build_document(doc_number: int) -> dict[str, object]:
    topic = TOPICS[(doc_number - 1) % len(TOPICS)]
    domain = DOMAINS[(doc_number - 1) % len(DOMAINS)]
    url = f"https://{domain}/{topic}/doc-{doc_number:05d}"
    title = f"Synthetic: {topic.replace('-', ' ').title()} Reference {doc_number}"
    body = build_body(doc_number, topic, domain)
    published_at = BASE_PUBLISHED_AT + timedelta(days=doc_number % 365)
    return {
        # Derived from the URL, so regenerating produces identical documents.
        "id": str(uuid5(NAMESPACE_URL, url)),
        "url": url,
        "canonical_url": url,
        "domain": domain,
        "source_slug": SOURCE_SLUG,
        "source_name": SOURCE_NAME,
        "content_type": CONTENT_TYPES[(doc_number - 1) % len(CONTENT_TYPES)],
        "section_path": f"Synthetic > {topic.replace('-', ' ').title()}",
        "title": title,
        "meta_description": f"Synthetic test document {doc_number} about {topic.replace('-', ' ')}.",
        "headings": [title, f"{topic.replace('-', ' ').title()} workflow", "Indexing notes"],
        "body": body,
        "language": LANGUAGES[(doc_number - 1) % len(LANGUAGES)],
        "published_at": published_at.isoformat(),
        "last_updated_at": published_at.isoformat(),
        "word_count": len(body.split()),
        "code_block_count": 0,
        "tags": ["synthetic", *TOPIC_TAGS[topic]],
        "boost_score": 6 + (doc_number % 5),
        "authority_score": 0,
        "freshness_status": "unknown",
    }


def operations(count: int, start_at: int) -> Iterator[dict]:
    for doc_number in range(start_at, start_at + count):
        yield upsert_operation(build_document(doc_number))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--count", type=int, default=10_000, help="Number of synthetic documents.")
    parser.add_argument("--start-at", type=int, default=1, help="First document number.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Index directory for the fixture.")
    args = parser.parse_args()
    if args.count < 1 or args.start_at < 1:
        raise SystemExit("--count and --start-at must be greater than 0")

    manifest = NativeIndexWriter(args.out).replace(operations(args.count, args.start_at))
    print(
        json.dumps(
            {
                "fixture": "synthetic",
                "indexDir": args.out,
                "documents": args.count,
                "batches": len(manifest["batches"]),
                "generation": manifest["generation"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
