from __future__ import annotations

import os
from dataclasses import dataclass


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(slots=True)
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql://mini_search:mini_search@localhost:5432/mini_search"
    )
    meili_host: str = os.getenv("MEILI_HOST", "http://localhost:7700")
    meili_master_key: str = os.getenv("MEILI_MASTER_KEY", "mini_search_master_key")
    crawler_user_agent: str = os.getenv(
        "CRAWLER_USER_AGENT", "MiniSearchBot/1.0 (+https://example.com/bot)"
    )
    crawler_max_depth: int = int(os.getenv("CRAWLER_MAX_DEPTH", "2"))
    crawler_concurrency: int = int(os.getenv("CRAWLER_CONCURRENCY", "5"))
    crawler_allowed_domains: tuple[str, ...] = tuple(
        domain.strip()
        for domain in os.getenv("CRAWLER_ALLOWED_DOMAINS", "example.com").split(",")
        if domain.strip()
    )
    crawler_ignore_robots: bool = env_flag("CRAWLER_IGNORE_ROBOTS", True)
    seed_config_path: str = os.getenv(
        "SEED_CONFIG_PATH", "services/crawler/seeds/sample_seeds.yaml"
    )
    meili_index_name: str = "documents"


settings = Settings()
