from types import SimpleNamespace

from app.pipeline.storage import compute_boost_score


def test_compute_boost_score_rewards_quality_content():
    parsed = SimpleNamespace(
        title="Title",
        meta_description="Description",
        word_count=550,
        code_block_count=0,
        section_path="",
    )
    # title=2, description=1, word_count=2, depth<=1=1  → base 6
    # authority_score=8 → min(5, int(8/2))=4 → total 10
    score = compute_boost_score(parsed, depth=1, authority_score=8)
    assert score == 10


def test_compute_boost_score_no_authority():
    parsed = SimpleNamespace(
        title="Title",
        meta_description="Description",
        word_count=550,
        code_block_count=3,
        section_path="Docs > Guide",
    )
    # title=2, desc=1, word_count=2, depth=1, code_blocks=1, section_path=1 → 8
    score = compute_boost_score(parsed, depth=1, authority_score=0)
    assert score == 8


def test_compute_boost_score_shallow_with_code():
    parsed = SimpleNamespace(
        title="",
        meta_description="",
        word_count=200,
        code_block_count=5,
        section_path="",
    )
    # No title, no desc, short body → 0+0+0+1(depth)+1(code)=2
    score = compute_boost_score(parsed, depth=0, authority_score=0)
    assert score == 2
