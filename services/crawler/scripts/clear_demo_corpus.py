"""Remove synthetic fixture data.

Deletes the synthetic index directory and any synthetic rows that older
versions of the fixture generator wrote into PostgreSQL. Crawled documents
are never touched: only rows with no source on a synthetic domain match.
"""

from __future__ import annotations

import json
import shutil

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.settings import settings
from app.db.connection import get_connection

SYNTHETIC_INDEX_DIR = Path(__file__).resolve().parents[3] / "data" / "search-index-synthetic"

SYNTHETIC_DOMAINS = (
    "docs.synthetic.local",
    "blog.synthetic.local",
    "kb.synthetic.local",
    "guides.synthetic.local",
)


def build_domain_filter(domains: tuple[str, ...]) -> str:
    values = ", ".join(json.dumps(domain) for domain in domains)
    return f"domain IN [{values}]"


def clear_demo_corpus() -> int:
    if "meilisearch" in settings.index_targets:
        from app.indexer.meili import delete_documents_by_filter

        delete_documents_by_filter(build_domain_filter(SYNTHETIC_DOMAINS))

    shutil.rmtree(SYNTHETIC_INDEX_DIR, ignore_errors=True)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM documents
                WHERE source_slug IS NULL AND domain = ANY(%s)
                """,
                (list(SYNTHETIC_DOMAINS),),
            )
            deleted = cur.rowcount
        conn.commit()

    return deleted


if __name__ == "__main__":
    print(f"Removed the synthetic index and {clear_demo_corpus()} legacy synthetic rows.")
