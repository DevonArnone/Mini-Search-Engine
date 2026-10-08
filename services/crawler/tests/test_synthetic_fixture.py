import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import generate_demo_corpus as fixture  # noqa: E402

from app.indexer.native import NativeIndexWriter  # noqa: E402


def test_fixture_is_deterministic_and_labeled_synthetic(tmp_path):
    first = [operation["doc"] for operation in fixture.operations(600, 1)]
    second = [operation["doc"] for operation in fixture.operations(600, 1)]
    assert first == second
    assert len({document["id"] for document in first}) == 600
    for document in first:
        assert document["source_slug"] == "synthetic"
        assert document["title"].startswith("Synthetic: ")
        assert document["domain"].endswith(".synthetic.local")
        assert "synthetic" in document["tags"]


def test_fixture_is_written_as_its_own_index(tmp_path):
    out = tmp_path / "synthetic-index"
    manifest = NativeIndexWriter(out).replace(fixture.operations(520, 1))
    assert [entry["upserts"] for entry in manifest["batches"]] == [250, 250, 20]
    assert fixture.DEFAULT_OUT.name == "search-index-synthetic"
