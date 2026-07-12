from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.connection import get_connection
from app.indexer.meili import delete_documents_by_filter


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
    delete_documents_by_filter(build_domain_filter(SYNTHETIC_DOMAINS))

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
    print(f"Removed {clear_demo_corpus()} synthetic documents.")
