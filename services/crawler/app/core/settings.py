from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_value(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


@lru_cache(maxsize=1)
def load_seed_runtime_config(path: str) -> dict:
    config_path = Path(path)
    if not config_path.exists():
        return {}
    with config_path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def resolve_runtime_crawler_config(seed_config_path: str) -> dict[str, object]:
    seed_config = load_seed_runtime_config(seed_config_path)
    defaults = seed_config.get("defaults", {}) if isinstance(seed_config, dict) else {}
    seed_allowed_domains = tuple(
        domain.strip()
        for domain in seed_config.get("allowed_domains", [])
        if isinstance(seed_config, dict) and isinstance(domain, str) and domain.strip()
    )

    raw_allowed_domains = env_value("CRAWLER_ALLOWED_DOMAINS")
    allowed_domains = (
        tuple(domain.strip() for domain in raw_allowed_domains.split(",") if domain.strip())
        if raw_allowed_domains
        else seed_allowed_domains or ("example.com",)
    )

    return {
        "crawler_max_depth": int(env_value("CRAWLER_MAX_DEPTH") or defaults.get("max_depth", 2)),
        "crawler_concurrency": int(env_value("CRAWLER_CONCURRENCY") or "5"),
        "crawler_allowed_domains": allowed_domains,
        "crawler_rate_limit_per_domain_ms": int(
            env_value("CRAWLER_RATE_LIMIT_PER_DOMAIN_MS")
            or defaults.get("rate_limit_per_domain_ms", 500)
        ),
        "crawler_max_retries": int(env_value("CRAWLER_MAX_RETRIES") or "3"),
    }


SEED_CONFIG_PATH = os.getenv("SEED_CONFIG_PATH", "services/crawler/seeds/sample_seeds.yaml")
RUNTIME_CRAWLER_CONFIG = resolve_runtime_crawler_config(SEED_CONFIG_PATH)


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
    crawler_max_depth: int = int(RUNTIME_CRAWLER_CONFIG["crawler_max_depth"])
    crawler_concurrency: int = int(RUNTIME_CRAWLER_CONFIG["crawler_concurrency"])
    crawler_allowed_domains: tuple[str, ...] = tuple(
        RUNTIME_CRAWLER_CONFIG["crawler_allowed_domains"]
    )
    crawler_rate_limit_per_domain_ms: int = int(
        RUNTIME_CRAWLER_CONFIG["crawler_rate_limit_per_domain_ms"]
    )
    crawler_max_retries: int = int(RUNTIME_CRAWLER_CONFIG["crawler_max_retries"])
    crawler_ignore_robots: bool = env_flag("CRAWLER_IGNORE_ROBOTS", True)
    seed_config_path: str = SEED_CONFIG_PATH
    meili_index_name: str = "documents"


settings = Settings()
