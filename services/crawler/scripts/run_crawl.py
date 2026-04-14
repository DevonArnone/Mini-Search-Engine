import asyncio
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.settings import settings
from app.pipeline.seeds import get_all_sources
from app.pipeline.worker import register_sources, run_worker


if __name__ == "__main__":
    # Pre-populate the in-memory source registry so the worker knows each
    # source's name and authority weight when upserting documents.
    sources = get_all_sources(settings.seed_config_path)
    register_sources(sources)
    asyncio.run(run_worker())
