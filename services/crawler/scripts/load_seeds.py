import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.queue import reset_queue_for_recrawl
from app.core.settings import settings
from app.pipeline.seeds import enqueue_seeds, get_all_sources
from app.pipeline.sitemaps import enqueue_sitemap_urls


def main() -> None:
    parser = argparse.ArgumentParser(description="Register sources and enqueue their seed and sitemap URLs.")
    parser.add_argument("--no-sitemaps", action="store_true", help="Enqueue only the explicit seed URLs.")
    parser.add_argument(
        "--recrawl",
        action="store_true",
        help="Also make previously finished queue items due again, for a full fresh crawl.",
    )
    args = parser.parse_args()

    print(f"Enqueued {enqueue_seeds(settings.seed_config_path)} seeds")
    sources = get_all_sources(settings.seed_config_path)
    if not args.no_sitemaps:
        for source in sources:
            if source.get("sitemaps"):
                print(f"{source['slug']}: enqueued {enqueue_sitemap_urls(source)} sitemap URLs")
    if args.recrawl:
        print(f"Reset {reset_queue_for_recrawl([source['slug'] for source in sources])} finished queue items")


if __name__ == "__main__":
    main()
