"""Batches crawled documents into durable index publications.

Crawl workers hand over document ids; a single consumer groups them into
batches of up to 250, publishes each batch off the event loop, and only then
marks the documents `indexed`. The hand-off queue is bounded, so a slow disk
or database slows the crawl instead of growing memory.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Callable

from app.core.settings import settings
from app.indexer.documents import (
    load_index_documents,
    mark_documents_index_failed,
    mark_documents_indexed,
    pending_document_ids,
)
from app.indexer.native import NativeIndexWriter, Operation, delete_operation, upsert_operation

logger = logging.getLogger(__name__)

PublishFunction = Callable[[list[Operation]], None]


def publish_to_targets(operations: list[Operation]) -> None:
    """Write one batch to every configured index target. Raises on any failure."""
    if "native" in settings.index_targets:
        NativeIndexWriter(settings.search_index_dir).publish(operations)
    if "meilisearch" in settings.index_targets:
        from app.indexer.meili import batch_index, delete_document_ids

        batch_index([operation["doc"] for operation in operations if operation["op"] == "upsert"])
        delete_document_ids([operation["id"] for operation in operations if operation["op"] == "delete"])


@dataclass(slots=True)
class PublisherStats:
    batches: int = 0
    published: int = 0
    deleted: int = 0
    failed_batches: int = 0
    failed_documents: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class _Item:
    document_id: str
    delete: bool = False


def publish_batch(items: list[_Item], publish: PublishFunction, stats: PublisherStats) -> None:
    """Blocking: load, publish, then record the outcome. Runs in a worker thread."""
    upsert_ids = [item.document_id for item in items if not item.delete]
    delete_ids = [item.document_id for item in items if item.delete]
    try:
        documents = load_index_documents(upsert_ids)
        operations = [upsert_operation(document) for document in documents]
        operations += [delete_operation(document_id) for document_id in delete_ids]
        if operations:
            publish(operations)
        # Only now is the batch durable; a crash before this line leaves the
        # documents `stored`, and the next run publishes them again.
        mark_documents_indexed([document["id"] for document in documents])
    except Exception as exc:  # noqa: BLE001 - every failure must leave retryable state
        stats.failed_batches += 1
        stats.failed_documents += len(upsert_ids)
        stats.errors.append(str(exc))
        logger.exception("index batch publication failed; documents stay retryable")
        try:
            mark_documents_index_failed(upsert_ids)
        except Exception:  # noqa: BLE001
            logger.exception("could not record index failure; documents remain 'stored'")
        return
    stats.batches += 1
    stats.published += len(documents)
    stats.deleted += len(delete_ids)


class BatchPublisher:
    def __init__(
        self,
        batch_size: int | None = None,
        flush_seconds: float | None = None,
        publish: PublishFunction = publish_to_targets,
        queue_size: int | None = None,
    ) -> None:
        self.batch_size = batch_size or settings.index_batch_size
        self.flush_seconds = flush_seconds if flush_seconds is not None else settings.index_flush_seconds
        self.stats = PublisherStats()
        self._publish = publish
        self._queue: asyncio.Queue[_Item | None] = asyncio.Queue(maxsize=queue_size or self.batch_size * 2)
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="index-publisher")

    async def submit(self, document_id: str) -> None:
        """Queue a stored document. Waits while the queue is full (backpressure)."""
        await self._queue.put(_Item(document_id))

    async def submit_delete(self, document_id: str) -> None:
        await self._queue.put(_Item(document_id, delete=True))

    async def resume_pending(self) -> int:
        """Queue documents a previous run stored but never published."""
        document_ids = await asyncio.to_thread(pending_document_ids)
        for document_id in document_ids:
            await self.submit(document_id)
        return len(document_ids)

    async def close(self) -> PublisherStats:
        """Flush everything still queued and stop the consumer."""
        if self._task is not None:
            await self._queue.put(None)
            await self._task
            self._task = None
        return self.stats

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        pending: list[_Item] = []
        flush_at = 0.0
        closing = False
        while not closing:
            flush = False
            try:
                # A partial batch is published once its oldest document has
                # waited the flush interval, however steadily others arrive.
                timeout = max(0.0, flush_at - loop.time()) if pending else None
                item = await asyncio.wait_for(self._queue.get(), timeout)
            except asyncio.TimeoutError:
                flush = True
            else:
                if item is None:
                    closing = flush = True
                else:
                    if not pending:
                        flush_at = loop.time() + self.flush_seconds
                    pending.append(item)
                    flush = loop.time() >= flush_at
            if pending and (flush or len(pending) >= self.batch_size):
                batch, pending = pending, []
                await asyncio.to_thread(publish_batch, batch, self._publish, self.stats)
