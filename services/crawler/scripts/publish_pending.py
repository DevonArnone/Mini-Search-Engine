"""Publish documents that are stored in PostgreSQL but not yet in the index.

Use after an interrupted crawl or a failed publication. Safe to run
repeatedly: publishing a document again replaces it, never duplicates it.
"""

import asyncio

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.indexer.publisher import BatchPublisher


async def main() -> int:
    publisher = BatchPublisher()
    publisher.start()
    queued = await publisher.resume_pending()
    stats = await publisher.close()
    print(f"Queued {queued}; published {stats.published} in {stats.batches} batches; {stats.failed_batches} failed batches")
    return 1 if stats.failed_batches else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
