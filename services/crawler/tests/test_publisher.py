import asyncio

import pytest

from app.indexer import publisher as publisher_module
from app.indexer.publisher import BatchPublisher


class FakeStore:
    """Stands in for PostgreSQL: tracks which documents are in which state."""

    def __init__(self, stored: list[str]):
        self.status = {document_id: "stored" for document_id in stored}
        self.events: list[tuple[str, int]] = []

    def load(self, ids):
        return [{"id": i, "body": "text"} for i in ids if self.status.get(i) in {"stored", "indexed", "index_failed"}]

    def mark_indexed(self, ids):
        self.events.append(("indexed", len(ids)))
        for i in ids:
            self.status[i] = "indexed"

    def mark_failed(self, ids):
        self.events.append(("failed", len(ids)))
        for i in ids:
            if self.status[i] == "stored":
                self.status[i] = "index_failed"

    def pending(self):
        return [i for i, status in self.status.items() if status in {"stored", "index_failed"}]


@pytest.fixture
def store(monkeypatch):
    fake = FakeStore([])
    monkeypatch.setattr(publisher_module, "load_index_documents", fake.load)
    monkeypatch.setattr(publisher_module, "mark_documents_indexed", fake.mark_indexed)
    monkeypatch.setattr(publisher_module, "mark_documents_index_failed", fake.mark_failed)
    monkeypatch.setattr(publisher_module, "pending_document_ids", fake.pending)
    return fake


def run(coroutine):
    return asyncio.run(coroutine)


def test_publishes_in_batches_of_at_most_250_and_flushes_the_remainder(store):
    ids = [f"d{number}" for number in range(620)]
    store.status = {i: "stored" for i in ids}
    published: list[int] = []

    async def scenario():
        publisher = BatchPublisher(batch_size=250, flush_seconds=60, publish=lambda ops: published.append(len(ops)))
        publisher.start()
        for i in ids:
            await publisher.submit(i)
        return await publisher.close()

    stats = run(scenario())
    assert published == [250, 250, 120]
    assert (stats.batches, stats.published, stats.failed_batches) == (3, 620, 0)
    assert set(store.status.values()) == {"indexed"}


def test_documents_are_marked_indexed_only_after_publication_returns(store):
    store.status = {"a": "stored", "b": "stored"}
    seen_during_publish: list[set[str]] = []

    def publish(operations):
        seen_during_publish.append(set(store.status.values()))

    async def scenario():
        publisher = BatchPublisher(batch_size=250, flush_seconds=60, publish=publish)
        publisher.start()
        await publisher.submit("a")
        await publisher.submit("b")
        await publisher.close()

    run(scenario())
    assert seen_during_publish == [{"stored"}]
    assert store.status == {"a": "indexed", "b": "indexed"}


def test_failed_publication_leaves_documents_retryable_and_can_resume(store):
    ids = [f"d{number}" for number in range(300)]
    store.status = {i: "stored" for i in ids}
    attempts = {"count": 0}
    published: list[str] = []

    def flaky_publish(operations):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise OSError("index volume unavailable")
        published.extend(operation["doc"]["id"] for operation in operations)

    async def first_run():
        publisher = BatchPublisher(batch_size=250, flush_seconds=60, publish=flaky_publish)
        publisher.start()
        for i in ids:
            await publisher.submit(i)
        return await publisher.close()

    stats = run(first_run())
    assert (stats.failed_batches, stats.failed_documents, stats.published) == (1, 250, 50)
    assert "volume unavailable" in stats.errors[0]
    # Nothing from the failed batch is recorded as indexed.
    assert sum(status == "index_failed" for status in store.status.values()) == 250
    assert sum(status == "indexed" for status in store.status.values()) == 50

    async def resumed_run():
        publisher = BatchPublisher(batch_size=250, flush_seconds=60, publish=flaky_publish)
        publisher.start()
        queued = await publisher.resume_pending()
        return queued, await publisher.close()

    queued, stats = run(resumed_run())
    assert queued == 250
    assert (stats.failed_batches, stats.published) == (0, 250)
    assert set(store.status.values()) == {"indexed"}
    # Every document reached the index exactly once across both runs.
    assert sorted(published) == sorted(ids)


def test_partial_batch_is_flushed_after_the_idle_interval(store):
    store.status = {"a": "stored"}
    published: list[int] = []

    async def scenario():
        publisher = BatchPublisher(batch_size=250, flush_seconds=0.05, publish=lambda ops: published.append(len(ops)))
        publisher.start()
        await publisher.submit("a")
        await asyncio.sleep(0.4)
        flushed_before_close = list(published)
        await publisher.close()
        return flushed_before_close

    assert run(scenario()) == [1]
    assert store.status == {"a": "indexed"}


def test_partial_batch_is_flushed_on_time_under_a_steady_stream(store):
    ids = [f"d{number}" for number in range(12)]
    store.status = {i: "stored" for i in ids}
    published: list[int] = []

    async def scenario():
        publisher = BatchPublisher(batch_size=250, flush_seconds=0.1, publish=lambda ops: published.append(len(ops)))
        publisher.start()
        # Arrivals are closer together than the flush interval, so an
        # idle-only timer would never fire.
        for i in ids:
            await publisher.submit(i)
            await asyncio.sleep(0.03)
        flushed_before_close = len(published)
        await publisher.close()
        return flushed_before_close

    assert run(scenario()) >= 2
    assert sum(published) == 12


def test_full_queue_applies_backpressure_to_submitters(store):
    ids = [f"d{number}" for number in range(40)]
    store.status = {i: "stored" for i in ids}
    release = asyncio.Event()
    loop_holder = {}

    def slow_publish(operations):
        # Holds the first batch until the test lets it through.
        asyncio.run_coroutine_threadsafe(release.wait(), loop_holder["loop"]).result(timeout=5)

    async def scenario():
        loop_holder["loop"] = asyncio.get_running_loop()
        publisher = BatchPublisher(batch_size=5, flush_seconds=60, publish=slow_publish, queue_size=10)
        publisher.start()
        submitted = 0

        async def submit_all():
            nonlocal submitted
            for i in ids:
                await publisher.submit(i)
                submitted += 1

        task = asyncio.create_task(submit_all())
        await asyncio.sleep(0.3)
        stalled_at = submitted
        release.set()
        await task
        await publisher.close()
        return stalled_at

    stalled_at = run(scenario())
    # One batch in flight plus a full queue; the producer could go no further.
    assert stalled_at == 15
    assert set(store.status.values()) == {"indexed"}


def test_deletions_are_published_as_tombstones(store):
    store.status = {"keep": "stored"}
    operations_seen: list[dict] = []

    async def scenario():
        publisher = BatchPublisher(batch_size=250, flush_seconds=60, publish=operations_seen.extend)
        publisher.start()
        await publisher.submit("keep")
        await publisher.submit_delete("gone")
        return await publisher.close()

    stats = run(scenario())
    assert operations_seen == [{"op": "upsert", "doc": {"id": "keep", "body": "text"}}, {"op": "delete", "id": "gone"}]
    assert (stats.published, stats.deleted) == (1, 1)


def test_document_removed_before_publication_is_not_marked_indexed(store):
    store.status = {"a": "stored", "b": "duplicate"}
    published: list[str] = []

    async def scenario():
        publisher = BatchPublisher(batch_size=250, flush_seconds=60, publish=lambda ops: published.extend(o["doc"]["id"] for o in ops))
        publisher.start()
        await publisher.submit("a")
        await publisher.submit("b")
        await publisher.close()

    run(scenario())
    assert published == ["a"]
    assert store.status == {"a": "indexed", "b": "duplicate"}
