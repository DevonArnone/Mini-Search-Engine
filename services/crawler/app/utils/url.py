from __future__ import annotations

from re import Pattern
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse


TRACKING_PREFIXES = ("utm_", "fbclid", "gclid")


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    scheme = parsed.scheme.lower() or "https"
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    while "//" in path:
        path = path.replace("//", "/")
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    filtered_query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith(TRACKING_PREFIXES)
    ]
    query = urlencode(filtered_query)
    return urlunparse((scheme, netloc, path, "", query, ""))


def extract_domain(url: str) -> str:
    return urlparse(url).netloc.lower()



def canonical_document_url(fetched_url: str, canonical: str | None, allowed_domains: tuple[str, ...] | list[str]) -> str:
    """The URL a document is stored under.

    A page's declared canonical URL wins when it stays on an allowlisted
    domain, so several addresses for one page collapse into one record.
    """
    fetched = normalize_url(fetched_url)
    if not canonical:
        return fetched
    resolved = normalize_url(urljoin(fetched_url, canonical.strip()))
    parsed = urlparse(resolved)
    if parsed.scheme not in {"http", "https"} or parsed.netloc not in allowed_domains:
        return fetched
    return resolved


def in_scope(url: str, allowed_domains: tuple[str, ...] | list[str], include_prefixes: tuple[str, ...] = (), exclude_patterns: tuple[Pattern[str], ...] = ()) -> bool:
    """True when a URL is inside a source's domain and path boundaries."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() not in allowed_domains:
        return False
    path = parsed.path or "/"
    if include_prefixes and not any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in include_prefixes):
        return False
    return not any(pattern.search(path) for pattern in exclude_patterns)
