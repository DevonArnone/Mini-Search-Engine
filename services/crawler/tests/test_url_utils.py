from app.utils.url import normalize_url


def test_normalize_url_removes_fragments_and_tracking_params():
    normalized = normalize_url("HTTPS://Example.com/docs/?utm_source=test&id=1#intro")
    assert normalized == "https://example.com/docs?id=1"

