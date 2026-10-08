"""Publisher for the native search index.

The index directory is shared with the web application's search engine:

    manifest.json                     replaced atomically (temp file + rename)
    manifest.lock                     held by the single writer while publishing
    batches/<generation>-<seq>.jsonl  immutable, one operation per line

A batch becomes visible only when the manifest that lists it has been renamed
into place, so a reader sees each batch completely or not at all. PostgreSQL
stays the source of truth; everything here can be rebuilt from it.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

FORMAT_VERSION = 1
MAX_BATCH_OPERATIONS = 250
MANIFEST_FILE = "manifest.json"
LOCK_FILE = "manifest.lock"
BATCH_DIR = "batches"
LOCK_STALE_SECONDS = 60
LOCK_WAIT_SECONDS = 30

Operation = dict[str, Any]


class IndexStoreError(RuntimeError):
    pass


def upsert_operation(document: dict[str, Any]) -> Operation:
    return {"op": "upsert", "doc": document}


def delete_operation(document_id: str) -> Operation:
    return {"op": "delete", "id": document_id}


def new_generation() -> str:
    return f"g{int(time.time() * 1000):x}{secrets.token_hex(3)}"


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _fsync_directory(directory: Path) -> None:
    try:
        handle = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(handle)
    except OSError:
        pass
    finally:
        os.close(handle)


def write_durably(target: Path, data: bytes) -> None:
    """Write to a temporary sibling, flush it to disk, then rename into place."""
    temporary = target.with_name(f"{target.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp")
    try:
        with open(temporary, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    _fsync_directory(target.parent)


def serialize_batch(operations: list[Operation]) -> bytes:
    lines = (json.dumps(operation, ensure_ascii=False, separators=(",", ":")) for operation in operations)
    return ("\n".join(lines) + "\n").encode("utf-8")


def parse_batch(data: bytes, label: str = "batch") -> list[Operation]:
    operations: list[Operation] = []
    for number, line in enumerate(data.decode("utf-8").split("\n"), start=1):
        if not line:
            continue
        try:
            operation = json.loads(line)
        except json.JSONDecodeError as exc:
            raise IndexStoreError(f"{label} line {number} is not valid JSON") from exc
        kind = operation.get("op") if isinstance(operation, dict) else None
        if kind == "upsert" and isinstance(operation.get("doc"), dict) and operation["doc"].get("id"):
            operations.append(operation)
        elif kind == "delete" and operation.get("id"):
            operations.append(operation)
        else:
            raise IndexStoreError(f"{label} line {number} has an unknown operation")
    return operations


class NativeIndexWriter:
    def __init__(self, index_dir: str | os.PathLike[str]) -> None:
        self.index_dir = Path(index_dir)

    # -- reading ------------------------------------------------------------

    def read_manifest(self) -> dict[str, Any] | None:
        try:
            text = (self.index_dir / MANIFEST_FILE).read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        try:
            manifest = json.loads(text)
        except json.JSONDecodeError as exc:
            raise IndexStoreError("manifest is not valid JSON") from exc
        if not isinstance(manifest, dict) or manifest.get("formatVersion") != FORMAT_VERSION:
            raise IndexStoreError("manifest has an unsupported format version")
        return manifest

    def read_batch(self, entry: dict[str, Any]) -> list[Operation]:
        data = (self.index_dir / entry["file"]).read_bytes()
        if len(data) != entry["bytes"]:
            raise IndexStoreError(f"batch {entry['seq']} is incomplete")
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise IndexStoreError(f"batch {entry['seq']} failed its checksum")
        return parse_batch(data, f"batch {entry['seq']}")

    def iter_operations(self) -> Iterator[Operation]:
        manifest = self.read_manifest()
        for entry in (manifest or {}).get("batches", []):
            yield from self.read_batch(entry)

    def live_document_ids(self) -> set[str]:
        live: set[str] = set()
        for operation in self.iter_operations():
            if operation["op"] == "upsert":
                live.add(operation["doc"]["id"])
            else:
                live.discard(operation["id"])
        return live

    # -- writing ------------------------------------------------------------

    def publish(self, operations: list[Operation]) -> dict[str, Any]:
        """Append operations as batches and publish them with one manifest swap."""
        with self._lock():
            current = self.read_manifest()
            generation = current["generation"] if current else new_generation()
            batches = list(current["batches"]) if current else []
            self._append_batches(generation, batches, operations)
            return self._write_manifest(generation, (current["revision"] if current else 0) + 1, batches)

    def replace(self, operations: Iterable[Operation]) -> dict[str, Any]:
        """Replace the whole index with a new generation, streaming the input."""
        with self._lock():
            current = self.read_manifest()
            generation = new_generation()
            batches: list[dict[str, Any]] = []
            pending: list[Operation] = []
            for operation in operations:
                pending.append(operation)
                if len(pending) == MAX_BATCH_OPERATIONS:
                    self._append_batches(generation, batches, pending)
                    pending = []
            self._append_batches(generation, batches, pending)
            return self._write_manifest(generation, (current["revision"] if current else 0) + 1, batches)

    def compact(self) -> dict[str, Any]:
        """Fold replacements and tombstones into a new generation of upserts."""
        with self._lock():
            current = self.read_manifest()
            if current is None:
                raise IndexStoreError("nothing to compact: no manifest has been published")
            # Latest position of each live document, so memory holds ids rather than bodies.
            latest: dict[str, tuple[int, int]] = {}
            for entry in current["batches"]:
                for position, operation in enumerate(self.read_batch(entry)):
                    if operation["op"] == "upsert":
                        latest[operation["doc"]["id"]] = (entry["seq"], position)
                    else:
                        latest.pop(operation["id"], None)

            generation = new_generation()
            batches: list[dict[str, Any]] = []
            pending: list[Operation] = []
            for entry in current["batches"]:
                for position, operation in enumerate(self.read_batch(entry)):
                    if operation["op"] != "upsert" or latest.get(operation["doc"]["id"]) != (entry["seq"], position):
                        continue
                    pending.append(operation)
                    if len(pending) == MAX_BATCH_OPERATIONS:
                        self._append_batches(generation, batches, pending)
                        pending = []
            self._append_batches(generation, batches, pending)
            return self._write_manifest(generation, current["revision"] + 1, batches)

    def prune(self, grace_seconds: float = 3600) -> int:
        """Delete batch files the manifest no longer references.

        Readers may still be hydrating a superseded generation, so files
        newer than the grace period are kept.
        """
        with self._lock():
            manifest = self.read_manifest()
            referenced = {entry["file"] for entry in (manifest or {}).get("batches", [])}
            removed = 0
            cutoff = time.time() - grace_seconds
            batch_dir = self.index_dir / BATCH_DIR
            if not batch_dir.is_dir():
                return 0
            for path in batch_dir.iterdir():
                relative = f"{BATCH_DIR}/{path.name}"
                if relative in referenced or path.stat().st_mtime > cutoff:
                    continue
                path.unlink()
                removed += 1
            return removed

    # -- internals ----------------------------------------------------------

    def _append_batches(self, generation: str, batches: list[dict[str, Any]], operations: list[Operation]) -> None:
        (self.index_dir / BATCH_DIR).mkdir(parents=True, exist_ok=True)
        for start in range(0, len(operations), MAX_BATCH_OPERATIONS):
            # Keep the lock fresh during long rebuilds so it is not taken for stale.
            os.utime(self.index_dir / LOCK_FILE)
            chunk = operations[start : start + MAX_BATCH_OPERATIONS]
            seq = len(batches) + 1
            file = f"{BATCH_DIR}/{generation}-{seq:08d}.jsonl"
            data = serialize_batch(chunk)
            write_durably(self.index_dir / file, data)
            batches.append(
                {
                    "seq": seq,
                    "file": file,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "bytes": len(data),
                    "upserts": sum(1 for operation in chunk if operation["op"] == "upsert"),
                    "deletes": sum(1 for operation in chunk if operation["op"] == "delete"),
                    "createdAt": _now(),
                }
            )

    def _write_manifest(self, generation: str, revision: int, batches: list[dict[str, Any]]) -> dict[str, Any]:
        manifest = {
            "formatVersion": FORMAT_VERSION,
            "generation": generation,
            "revision": revision,
            "updatedAt": _now(),
            "batches": batches,
        }
        data = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
        write_durably(self.index_dir / MANIFEST_FILE, data)
        return manifest

    @contextmanager
    def _lock(self) -> Iterator[None]:
        self.index_dir.mkdir(parents=True, exist_ok=True)
        lock_path = self.index_dir / LOCK_FILE
        deadline = time.monotonic() + LOCK_WAIT_SECONDS
        while True:
            try:
                handle = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except FileExistsError:
                try:
                    if time.time() - lock_path.stat().st_mtime > LOCK_STALE_SECONDS:
                        lock_path.unlink(missing_ok=True)
                        continue
                except FileNotFoundError:
                    continue
                if time.monotonic() > deadline:
                    raise IndexStoreError("timed out waiting for the index writer lock") from None
                time.sleep(0.025)
                continue
            with os.fdopen(handle, "w") as lock_file:
                lock_file.write(f"{os.getpid()}\n")
            break
        try:
            yield
        finally:
            lock_path.unlink(missing_ok=True)
