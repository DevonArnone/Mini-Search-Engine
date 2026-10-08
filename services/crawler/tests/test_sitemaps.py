import gzip

from app.pipeline.sitemaps import discover_sitemap_urls, parse_sitemap

NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'


def urlset(*urls: str) -> bytes:
    return f"<urlset {NS}>{''.join(f'<url><loc>{url}</loc></url>' for url in urls)}</urlset>".encode()


def index(*urls: str) -> bytes:
    return f"<sitemapindex {NS}>{''.join(f'<sitemap><loc>{url}</loc></sitemap>' for url in urls)}</sitemapindex>".encode()


SOURCE = {
    "slug": "docs",
    "allowed_domains": ["docs.example.test"],
    "include_path_prefixes": ["/guide/"],
    "exclude_path_patterns": [r"/print/"],
    "sitemaps": ["https://docs.example.test/sitemap.xml"],
}


def test_parse_sitemap_handles_urlsets_indexes_and_gzip():
    assert parse_sitemap(urlset("https://a.test/1", "https://a.test/2")) == (["https://a.test/1", "https://a.test/2"], [])
    assert parse_sitemap(index("https://a.test/s1.xml")) == ([], ["https://a.test/s1.xml"])
    assert parse_sitemap(gzip.compress(urlset("https://a.test/1"))) == (["https://a.test/1"], [])


def test_discovery_follows_indexes_and_keeps_only_in_scope_pages(monkeypatch):
    monkeypatch.setattr("app.pipeline.sitemaps.can_fetch", lambda url: True)
    files = {
        "https://docs.example.test/sitemap.xml": index(
            "https://docs.example.test/sitemap-a.xml",
            "https://elsewhere.example.test/sitemap.xml",
        ),
        "https://docs.example.test/sitemap-a.xml": urlset(
            "https://docs.example.test/guide/install/",
            "https://docs.example.test/guide/install",
            "https://docs.example.test/guide/print/install",
            "https://docs.example.test/blog/news",
            "https://other.example.test/guide/x",
            "https://docs.example.test/guide/usage?utm_source=feed",
        ),
    }
    fetched: list[str] = []

    def fetch(url: str) -> bytes:
        fetched.append(url)
        return files[url]

    urls = discover_sitemap_urls(SOURCE, fetch=fetch, delay_seconds=0)
    assert urls == ["https://docs.example.test/guide/install", "https://docs.example.test/guide/usage"]
    # The sitemap on another domain is never requested.
    assert fetched == ["https://docs.example.test/sitemap.xml", "https://docs.example.test/sitemap-a.xml"]


def test_discovery_respects_robots_and_the_url_cap(monkeypatch):
    pages = urlset(*(f"https://docs.example.test/guide/p{number}" for number in range(10)))
    monkeypatch.setattr("app.pipeline.sitemaps.can_fetch", lambda url: True)
    capped = discover_sitemap_urls({**SOURCE, "max_sitemap_urls": 3}, fetch=lambda url: pages, delay_seconds=0)
    assert capped == [f"https://docs.example.test/guide/p{number}" for number in range(3)]

    monkeypatch.setattr("app.pipeline.sitemaps.can_fetch", lambda url: False)
    assert discover_sitemap_urls(SOURCE, fetch=lambda url: pages, delay_seconds=0) == []
