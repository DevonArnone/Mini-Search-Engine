from __future__ import annotations

from pathlib import Path

import yaml

from app.core.queue import enqueue_url


def load_seed_config(path: str) -> dict:
    with Path(path).open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def enqueue_seeds(path: str) -> int:
    config = load_seed_config(path)
    count = 0
    defaults = config.get("defaults", {}) if isinstance(config, dict) else {}
    default_priority = defaults.get("priority", 100)
    for seed in config.get("seeds", []):
        enqueue_url(
            seed["url"],
            depth=0,
            source_url=None,
            priority=seed.get("priority", default_priority),
        )
        count += 1
    return count
