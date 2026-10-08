"""Rebuild the native search index from PostgreSQL.

Streams every indexable crawled document through a server-side cursor into a
new index generation, then swaps the manifest. Readers keep serving the old
generation until the swap and rehydrate afterwards.

    python scripts/rebuild_index.py                      # full rebuild in SEARCH_INDEX_DIR
    python scripts/rebuild_index.py --limit 5000 --out data/bench/5k
"""

import argparse
import json
import time

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.settings import settings
from app.indexer.documents import mark_documents_indexed, stream_index_documents
from app.indexer.native import MAX_BATCH_OPERATIONS, NativeIndexWriter, upsert_operation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=settings.search_index_dir, help="Index directory to write.")
    parser.add_argument("--limit", type=int, help="Export a deterministic sample of this many documents.")
    parser.add_argument("--source", action="append", help="Restrict to a source slug (repeatable).")
    args = parser.parse_args()

    primary = args.out == settings.search_index_dir and args.limit is None and not args.source
    started = time.perf_counter()
    exported: list[str] = []

    def operations():
        for document in stream_index_documents(source_slugs=args.source, limit=args.limit):
            exported.append(document["id"])
            yield upsert_operation(document)

    manifest = NativeIndexWriter(args.out).replace(operations())

    # Only a full rebuild of the live index changes what PostgreSQL records
    # as published; samples written elsewhere leave statuses alone.
    if primary:
        for start in range(0, len(exported), MAX_BATCH_OPERATIONS * 4):
            mark_documents_indexed(exported[start : start + MAX_BATCH_OPERATIONS * 4])

    print(
        json.dumps(
            {
                "indexDir": args.out,
                "generation": manifest["generation"],
                "revision": manifest["revision"],
                "batches": len(manifest["batches"]),
                "documents": len(exported),
                "markedIndexed": primary,
                "seconds": round(time.perf_counter() - started, 2),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
