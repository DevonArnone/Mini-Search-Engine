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
    for seed in config.get("seeds", []):
        enqueue_url(seed["url"], depth=0, source_url=None, priority=seed.get("priority", 100))
        count += 1
    return count

