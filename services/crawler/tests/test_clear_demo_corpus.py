from scripts.clear_demo_corpus import build_domain_filter


def test_domain_filter_quotes_each_domain():
    assert build_domain_filter(("one.example", "two.example")) == (
        'domain IN ["one.example", "two.example"]'
    )
