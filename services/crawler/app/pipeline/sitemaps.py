"""Seed discovery from a source's published sitemaps."""

from __future__ import annotations

import gzip
import re
import time
from urllib.parse import urlparse
from xml.etree import ElementTree

import httpx

from app.core.queue import enqueue_urls
from app.core.robots import can_fetch
from app.core.settings import settings
from app.utils.url import in_scope, normalize_url

MAX_SITEMAP_FILES = 25
MAX_SITEMAP_BYTES = 50_000_000
SITEMAP_PRIORITY = 50
DEPRIORITIZED_SITEMAP_PRIORITY = 60


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_sitemap(data: bytes) -> tuple[list[str], list[str]]:
    """Return (page URLs, child sitemap URLs) from a sitemap or sitemap index."""
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    root = ElementTree.fromstring(data)
    locations = [
        (element.text or "").strip()
        for element in root.iter()
        if _local(element.tag) == "loc" and (element.text or "").strip()
    ]
    if _local(root.tag) == "sitemapindex":
        return [], locations
    return locations, []


def discover_sitemap_urls(source: dict, fetch=None, delay_seconds: float | None = None) -> list[str]:
    """Collect in-scope page URLs from a source's sitemaps, in sitemap order."""
    allowed_domains = tuple(source.get("allowed_domains", []))
    include_prefixes = tuple(source.get("include_path_prefixes", []))
    exclude_patterns = tuple(re.compile(pattern) for pattern in source.get("exclude_path_patterns", []))
    limit = source.get("max_sitemap_urls")
    delay = (
        int(source.get("rate_limit_per_domain_ms", settings.crawler_rate_limit_per_domain_ms)) / 1000
        if delay_seconds is None
        else delay_seconds
    )

    def default_fetch(url: str) -> bytes:
        response = httpx.get(
            url,
            headers={"User-Agent": settings.crawler_user_agent},
            follow_redirects=True,
            timeout=30.0,
        )
        response.raise_for_status()
        if len(response.content) > MAX_SITEMAP_BYTES:
            raise ValueError(f"sitemap is larger than {MAX_SITEMAP_BYTES} bytes: {url}")
        return response.content

    fetch = fetch or default_fetch
    pending = list(source.get("sitemaps", []))
    visited: set[str] = set()
    found: dict[str, None] = {}

    while pending and len(visited) < MAX_SITEMAP_FILES:
        sitemap_url = pending.pop(0)
        if sitemap_url in visited:
            continue
        visited.add(sitemap_url)
        # Sitemaps must live on the source's own domains and be fetchable.
        if not in_scope(sitemap_url, allowed_domains):
            continue
        if not settings.crawler_ignore_robots and not can_fetch(sitemap_url):
            continue
        if len(visited) > 1 and delay > 0:
            time.sleep(delay)
        pages, children = parse_sitemap(fetch(sitemap_url))
        pending.extend(children)
        for page in pages:
            normalized = normalize_url(page)
            if in_scope(normalized, allowed_domains, include_prefixes, exclude_patterns):
                found.setdefault(normalized, None)

    urls = list(found)
    return urls[: int(limit)] if limit else urls


def enqueue_sitemap_urls(source: dict) -> int:
    urls = discover_sitemap_urls(source)
    later = tuple(source.get("deprioritized_path_prefixes", []))
    first = [url for url in urls if not (later and urlparse(url).path.startswith(later))]
    last = [url for url in urls if later and urlparse(url).path.startswith(later)]
    enqueue_urls(first, depth=1, priority=SITEMAP_PRIORITY, source_slug=source["slug"])
    enqueue_urls(last, depth=1, priority=DEPRIORITIZED_SITEMAP_PRIORITY, source_slug=source["slug"])
    return len(urls)
