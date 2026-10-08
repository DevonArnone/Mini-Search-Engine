"""Compact the native search index.

Rewrites the batch list as a new generation containing only the latest
version of each live document, dropping replaced versions and tombstones.

    python scripts/compact_index.py            # compact
    python scripts/compact_index.py --prune    # also delete superseded batch files
"""

import argparse
import json

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.settings import settings
from app.indexer.native import NativeIndexWriter


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default=settings.search_index_dir, help="Index directory to compact.")
    parser.add_argument("--prune", action="store_true", help="Delete batch files no manifest references.")
    parser.add_argument(
        "--grace-seconds",
        type=float,
        default=3600,
        help="With --prune, keep unreferenced files newer than this so running readers can finish.",
    )
    args = parser.parse_args()

    writer = NativeIndexWriter(args.dir)
    before = writer.read_manifest()
    manifest = writer.compact()
    result = {
        "indexDir": args.dir,
        "generation": manifest["generation"],
        "revision": manifest["revision"],
        "batchesBefore": len(before["batches"]) if before else 0,
        "batchesAfter": len(manifest["batches"]),
        "operationsBefore": sum(entry["upserts"] + entry["deletes"] for entry in before["batches"]) if before else 0,
        "documentsAfter": sum(entry["upserts"] for entry in manifest["batches"]),
    }
    if args.prune:
        result["prunedFiles"] = writer.prune(args.grace_seconds)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
