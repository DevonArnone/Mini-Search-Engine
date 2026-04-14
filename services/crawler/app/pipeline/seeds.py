from __future__ import annotations

from pathlib import Path

import yaml

from app.core.queue import enqueue_url
from app.db.connection import db_cursor


def load_seed_config(path: str) -> dict:
    with Path(path).open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def _upsert_source_registry(source: dict) -> None:
    """Insert or refresh a source row in the source_registry table."""
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO source_registry (
                slug, name, description, home_url, authority_weight, crawl_cadence_hours,
                crawl_status, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'pending', NOW())
            ON CONFLICT (slug) DO UPDATE SET
                name               = EXCLUDED.name,
                description        = EXCLUDED.description,
                home_url           = EXCLUDED.home_url,
                authority_weight   = EXCLUDED.authority_weight,
                crawl_cadence_hours = EXCLUDED.crawl_cadence_hours,
                updated_at         = NOW()
            """,
            (
                source["slug"],
                source["name"],
                source.get("description", ""),
                source["home_url"],
                float(source.get("authority_weight", 5)),
                int(source.get("crawl_cadence_hours", 168)),
            ),
        )


def enqueue_seeds(path: str) -> int:
    """Load the source registry YAML, register sources, and enqueue seed URLs."""
    config = load_seed_config(path)
    count = 0
    defaults = config.get("defaults", {}) if isinstance(config, dict) else {}
    default_priority = defaults.get("priority", 100)

    # Support both the new "sources" format and the legacy "seeds" flat format
    sources = config.get("sources", [])
    if sources:
        # New format: per-source entries
        for source in sources:
            _upsert_source_registry(source)
            slug = source["slug"]
            for seed in source.get("seeds", []):
                enqueue_url(
                    seed["url"],
                    depth=0,
                    source_url=None,
                    priority=seed.get("priority", default_priority),
                    source_slug=slug,
                )
                count += 1
    else:
        # Legacy format: flat seeds list
        for seed in config.get("seeds", []):
            enqueue_url(
                seed["url"],
                depth=0,
                source_url=None,
                priority=seed.get("priority", default_priority),
            )
            count += 1

    return count


def get_all_sources(path: str) -> list[dict]:
    """Return the full source list for use by the worker registry."""
    config = load_seed_config(path)
    return config.get("sources", [])
