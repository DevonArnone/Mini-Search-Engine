from app.utils.url import normalize_url


def test_normalize_url_removes_fragments_and_tracking_params():
    normalized = normalize_url("HTTPS://Example.com/docs/?utm_source=test&id=1#intro")
    assert normalized == "https://example.com/docs?id=1"



def test_canonical_document_url_prefers_an_allowlisted_canonical():
    from app.utils.url import canonical_document_url

    allowed = ("docs.example.test",)
    fetched = "https://docs.example.test/guide/install/?utm_source=x"
    assert canonical_document_url(fetched, None, allowed) == "https://docs.example.test/guide/install"
    assert canonical_document_url(fetched, "/guide/setup", allowed) == "https://docs.example.test/guide/setup"
    assert canonical_document_url(fetched, "https://docs.example.test/guide/setup#top", allowed) == "https://docs.example.test/guide/setup"
    # A canonical pointing off the allowlist is ignored.
    assert canonical_document_url(fetched, "https://mirror.example.org/guide/setup", allowed) == "https://docs.example.test/guide/install"
    assert canonical_document_url(fetched, "javascript:void(0)", allowed) == "https://docs.example.test/guide/install"


def test_in_scope_enforces_domain_and_path_boundaries():
    import re

    from app.utils.url import in_scope

    allowed = ("docs.example.test",)
    prefixes = ("/docs/current/", "/learn")
    excluded = (re.compile(r"/print/"),)
    assert in_scope("https://docs.example.test/docs/current/sql.html", allowed, prefixes, excluded)
    assert in_scope("https://docs.example.test/learn", allowed, prefixes, excluded)
    assert in_scope("https://docs.example.test/learn/thinking", allowed, prefixes, excluded)
    assert not in_scope("https://docs.example.test/docs/9.0/sql.html", allowed, prefixes, excluded)
    assert not in_scope("https://docs.example.test/docs/current/print/sql.html", allowed, prefixes, excluded)
    assert not in_scope("https://evil.example.org/docs/current/sql.html", allowed, prefixes, excluded)
    assert not in_scope("ftp://docs.example.test/docs/current/x", allowed, prefixes, excluded)
    assert in_scope("https://docs.example.test/anything", allowed)
