from pathlib import Path

from app.core.settings import resolve_runtime_crawler_config
from app.pipeline.worker import compute_retry_delay_seconds, should_retry


def test_resolve_runtime_crawler_config_uses_seed_defaults(tmp_path: Path, monkeypatch):
    for key in (
        "CRAWLER_MAX_DEPTH",
        "CRAWLER_ALLOWED_DOMAINS",
        "CRAWLER_RATE_LIMIT_PER_DOMAIN_MS",
        "CRAWLER_CONCURRENCY",
        "CRAWLER_MAX_RETRIES",
    ):
        monkeypatch.delenv(key, raising=False)

    config_path = tmp_path / "seeds.yaml"
    config_path.write_text(
        """
allowed_domains:
  - docs.example.test
  - blog.example.test
defaults:
  max_depth: 4
  rate_limit_per_domain_ms: 1200
""".strip(),
        encoding="utf-8",
    )

    resolved = resolve_runtime_crawler_config(str(config_path))

    assert resolved["crawler_max_depth"] == 4
    assert resolved["crawler_rate_limit_per_domain_ms"] == 1200
    assert resolved["crawler_allowed_domains"] == (
        "docs.example.test",
        "blog.example.test",
    )


def test_retry_delay_backoff_is_capped():
    assert compute_retry_delay_seconds(1) == 5
    assert compute_retry_delay_seconds(2) == 10
    assert compute_retry_delay_seconds(10) == 300


def test_should_retry_only_for_retryable_statuses():
    assert should_retry(500, retry_count=0) is True
    assert should_retry(429, retry_count=0) is True
    assert should_retry(404, retry_count=0) is False
    assert should_retry(None, retry_count=0) is True
