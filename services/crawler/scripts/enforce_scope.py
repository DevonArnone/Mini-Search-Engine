"""Bring stored documents in line with the source registry's boundaries.

Normalizes stored URLs to the form the crawler now uses, and marks documents
outside their source's allowed paths as `excluded` so they are no longer
indexed. Nothing is deleted. Run a rebuild afterwards.
"""

import re

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.settings import settings
from app.db.connection import db_cursor
from app.pipeline.seeds import get_all_sources
from app.utils.url import in_scope, normalize_url


def main() -> None:
    sources = {source["slug"]: source for source in get_all_sources(settings.seed_config_path)}
    normalized = excluded = 0
    with db_cursor() as cur:
        cur.execute("SELECT id, url, source_slug, status FROM documents WHERE source_slug IS NOT NULL")
        rows = cur.fetchall()
        taken = {row["url"] for row in rows}
        for row in rows:
            source = sources.get(row["source_slug"])
            url = row["url"]
            target = normalize_url(url)
            if target != url and target not in taken:
                cur.execute("UPDATE documents SET url = %s WHERE id = %s", (target, row["id"]))
                taken.add(target)
                url = target
                normalized += 1
            allowed = source is not None and in_scope(
                url,
                tuple(source.get("allowed_domains", [])),
                tuple(source.get("include_path_prefixes", [])),
                tuple(re.compile(pattern) for pattern in source.get("exclude_path_patterns", [])),
            )
            if not allowed and row["status"] in ("stored", "indexed", "index_failed"):
                cur.execute("UPDATE documents SET status = 'excluded', updated_at = NOW() WHERE id = %s", (row["id"],))
                excluded += 1
    print(f"Normalized {normalized} URLs; excluded {excluded} out-of-scope documents")


if __name__ == "__main__":
    main()
