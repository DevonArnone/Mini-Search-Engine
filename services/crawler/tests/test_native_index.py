import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from app.indexer import native
from app.indexer.native import (
    IndexStoreError,
    NativeIndexWriter,
    delete_operation,
    upsert_operation,
)


def doc(document_id: str, body: str = "text") -> dict:
    return {"id": document_id, "url": f"https://docs.example.test/{document_id}", "title": document_id, "body": body}


def upserts(count: int, prefix: str = "d") -> list[dict]:
    return [upsert_operation(doc(f"{prefix}{number}")) for number in range(count)]


def test_publish_splits_into_immutable_batches_of_at_most_250(tmp_path):
    writer = NativeIndexWriter(tmp_path)
    manifest = writer.publish(upserts(601))
    assert [entry["upserts"] for entry in manifest["batches"]] == [250, 250, 101]
    assert manifest["revision"] == 1

    first_batch = (tmp_path / manifest["batches"][0]["file"]).read_bytes()
    following = writer.publish([delete_operation("d0")])
    assert following["generation"] == manifest["generation"]
    assert following["revision"] == 2
    assert [entry["seq"] for entry in following["batches"]] == [1, 2, 3, 4]
    assert following["batches"][3]["deletes"] == 1
    assert (tmp_path / following["batches"][0]["file"]).read_bytes() == first_batch
    assert writer.read_manifest() == following


def test_publish_leaves_no_temporary_or_lock_files(tmp_path):
    NativeIndexWriter(tmp_path).publish(upserts(3))
    names = [path.name for path in tmp_path.rglob("*")]
    assert not [name for name in names if name.endswith((".tmp", ".lock"))]


def test_failed_manifest_write_publishes_nothing(tmp_path, monkeypatch):
    writer = NativeIndexWriter(tmp_path)
    before = writer.publish(upserts(2))

    real_replace = os.replace

    def failing_replace(source, target):
        if Path(target).name == native.MANIFEST_FILE:
            raise OSError("disk full")
        real_replace(source, target)

    monkeypatch.setattr(native.os, "replace", failing_replace)
    with pytest.raises(OSError, match="disk full"):
        writer.publish(upserts(5, prefix="new"))
    monkeypatch.undo()

    # The manifest still describes the last complete publication, the lock is
    # released, and no temporary files remain.
    assert writer.read_manifest() == before
    assert writer.live_document_ids() == {"d0", "d1"}
    assert not list(tmp_path.glob("*.tmp")) and not (tmp_path / native.LOCK_FILE).exists()
    assert writer.publish(upserts(1, prefix="later"))["revision"] == 2


def test_failed_batch_write_publishes_nothing(tmp_path, monkeypatch):
    writer = NativeIndexWriter(tmp_path)
    before = writer.publish(upserts(1))

    def failing_write(target, data):
        raise OSError("volume unavailable")

    monkeypatch.setattr(native, "write_durably", failing_write)
    with pytest.raises(OSError):
        writer.publish(upserts(1, prefix="new"))
    monkeypatch.undo()
    assert writer.read_manifest() == before


def test_replace_starts_a_new_generation(tmp_path):
    writer = NativeIndexWriter(tmp_path)
    first = writer.publish(upserts(3))
    second = writer.replace(iter(upserts(600, prefix="n")))
    assert second["generation"] != first["generation"]
    assert second["revision"] == 2
    assert [entry["upserts"] for entry in second["batches"]] == [250, 250, 100]
    assert len(writer.live_document_ids()) == 600


def test_compact_keeps_only_the_latest_live_version(tmp_path):
    writer = NativeIndexWriter(tmp_path)
    writer.publish([upsert_operation(doc("a", "one")), upsert_operation(doc("b", "one")), upsert_operation(doc("c", "one"))])
    writer.publish([upsert_operation(doc("a", "two")), delete_operation("b")])
    writer.publish([upsert_operation(doc("b", "back")), delete_operation("c"), delete_operation("missing")])
    before = writer.read_manifest()

    after = writer.compact()
    assert after["generation"] != before["generation"]
    assert after["revision"] == before["revision"] + 1
    operations = list(writer.iter_operations())
    assert all(operation["op"] == "upsert" for operation in operations)
    assert {operation["doc"]["id"]: operation["doc"]["body"] for operation in operations} == {"a": "two", "b": "back"}


def test_prune_removes_only_unreferenced_old_batches(tmp_path):
    writer = NativeIndexWriter(tmp_path)
    old = writer.publish(upserts(2))
    writer.compact()
    old_file = tmp_path / old["batches"][0]["file"]
    assert old_file.exists()
    assert writer.prune(grace_seconds=3600) == 0  # still inside the grace period
    assert writer.prune(grace_seconds=0) == 1
    assert not old_file.exists()
    assert len(writer.live_document_ids()) == 2


def test_corrupt_and_truncated_batches_are_rejected(tmp_path):
    writer = NativeIndexWriter(tmp_path)
    manifest = writer.publish(upserts(4))
    path = tmp_path / manifest["batches"][0]["file"]
    original = path.read_bytes()

    path.write_bytes(original[:-5])
    with pytest.raises(IndexStoreError, match="incomplete"):
        writer.read_batch(manifest["batches"][0])

    path.write_bytes(original.replace(b"d0", b"zz", 1))
    with pytest.raises(IndexStoreError, match="checksum"):
        writer.read_batch(manifest["batches"][0])


def test_stale_lock_is_taken_over(tmp_path):
    lock = tmp_path / native.LOCK_FILE
    lock.write_text("999999\n")
    stale = lock.stat().st_mtime - native.LOCK_STALE_SECONDS - 5
    os.utime(lock, (stale, stale))
    assert NativeIndexWriter(tmp_path).publish(upserts(1))["revision"] == 1
    assert not lock.exists()


def test_unicode_is_written_as_utf8(tmp_path):
    writer = NativeIndexWriter(tmp_path)
    manifest = writer.publish([upsert_operation(doc("u", "café → naïve 日本語"))])
    raw = (tmp_path / manifest["batches"][0]["file"]).read_bytes()
    assert "café → naïve 日本語".encode() in raw
    assert json.loads(raw)["doc"]["body"] == "café → naïve 日本語"


CLI = Path(__file__).resolve().parents[3] / "packages" / "search-engine" / "dist" / "cli.js"


@pytest.mark.skipif(not CLI.exists() or shutil.which("node") is None, reason="search engine is not built")
def test_node_engine_reads_what_python_publishes(tmp_path):
    writer = NativeIndexWriter(tmp_path)
    writer.publish(upserts(300) + [upsert_operation(doc("special", "zebra crossing café"))])
    writer.publish([delete_operation("d0"), upsert_operation(doc("d1", "replaced zebra"))])

    verified = json.loads(subprocess.run(["node", str(CLI), "verify", str(tmp_path)], check=True, capture_output=True, text=True).stdout)
    assert verified["liveDocuments"] == len(writer.live_document_ids()) == 300
    assert (verified["batches"], verified["upserts"], verified["deletes"]) == (3, 302, 1)

    found = json.loads(subprocess.run(["node", str(CLI), "search", str(tmp_path), "zebra"], check=True, capture_output=True, text=True).stdout)
    assert {hit["id"] for hit in found["hits"]} == {"special", "d1"}
