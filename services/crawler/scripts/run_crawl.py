import asyncio
from datetime import datetime, timezone
from pathlib import Path
import signal
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.queue import requeue_stale_processing
from app.core.settings import settings
from app.pipeline.seeds import get_all_sources
from app.pipeline.storage import get_source_queue_outcomes, update_source_registry
from app.pipeline.worker import register_sources, run_worker


async def crawl() -> int:
    started_at = datetime.now(tz=timezone.utc)
    sources = get_all_sources(settings.seed_config_path)
    register_sources(sources)
    requeue_stale_processing()
    for source in sources:
        update_source_registry(source["slug"], "crawling")

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signal_name, stop_event.set)
        except NotImplementedError:
            pass

    await run_worker(stop_event)
    attempted_at = datetime.now(tz=timezone.utc)
    outcomes = get_source_queue_outcomes(started_at)
    failed_sources = 0
    for source in sources:
        outcome = outcomes.get(source["slug"], {"done": 0, "failed": 0, "remaining": 0})
        healthy = outcome["failed"] == 0 and outcome["remaining"] == 0
        status = "healthy" if healthy else "crawling" if outcome["remaining"] else "failing"
        update_source_registry(source["slug"], status, attempted_at, successful=healthy and outcome["done"] > 0)
        failed_sources += int(status == "failing")

    if stop_event.is_set():
        return 130
    return 1 if failed_sources else 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(crawl()))
    except (ValueError, FileNotFoundError) as exc:
        print(f"Crawler configuration error: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
