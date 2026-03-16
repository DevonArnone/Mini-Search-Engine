from types import SimpleNamespace

from app.pipeline.storage import compute_boost_score


def test_compute_boost_score_rewards_quality_content():
    parsed = SimpleNamespace(
        title="Title",
        meta_description="Description",
        word_count=550,
    )
    assert compute_boost_score(parsed, depth=1, domain_priority=2) == 8
