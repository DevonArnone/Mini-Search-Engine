from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


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

