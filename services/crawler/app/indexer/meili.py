from __future__ import annotations

from typing import Any

import meilisearch

from app.core.settings import settings


def get_client() -> meilisearch.Client:
    return meilisearch.Client(settings.meili_host, settings.meili_master_key)


def _task_uid(task: Any) -> int:
    if isinstance(task, dict):
        value = task.get("taskUid") or task.get("uid")
    else:
        value = getattr(task, "task_uid", None) or getattr(task, "uid", None)
    if value is None:
        raise RuntimeError("Meilisearch did not return a task identifier")
    return int(value)


def _wait_for_task(client: meilisearch.Client, task: Any) -> None:
    result = client.wait_for_task(
        _task_uid(task),
        timeout_in_ms=settings.meili_task_timeout_ms,
        interval_in_ms=50,
    )
    status = result.get("status") if isinstance(result, dict) else getattr(result, "status", None)
    if status != "succeeded":
        error = result.get("error") if isinstance(result, dict) else getattr(result, "error", None)
        raise RuntimeError(f"Meilisearch task failed: {error or status or 'unknown error'}")


def configure_index() -> None:
    client = get_client()
    try:
        client.get_index(settings.meili_index_name)
    except Exception:
        _wait_for_task(client, client.create_index(settings.meili_index_name, {"primaryKey": "id"}))
    index = client.index(settings.meili_index_name)

    # Fields searched when no explicit attribute target is specified.
    # Listed in priority order — matches earlier in the list rank higher.
    _wait_for_task(client, index.update_searchable_attributes([
        "title",
        "headings",
        "section_path",
        "source_name",
        "meta_description",
        "body",
        "tags",
    ]))

    # Fields that can be used in filter expressions (e.g. source_slug = "react")
    _wait_for_task(client, index.update_filterable_attributes([
        "source_slug",
        "content_type",
        "domain",
        "language",
        "published_at",
        "last_updated_at",
        "tags",
        "freshness_status",
        "code_block_count",
    ]))

    # Fields that can be used in explicit sort= clauses
    _wait_for_task(client, index.update_sortable_attributes([
        "published_at",
        "last_updated_at",
        "word_count",
        "boost_score",
        "authority_score",
        "code_block_count",
    ]))

    # Fields returned in search hits (exclude large raw fields)
    _wait_for_task(client, index.update_displayed_attributes([
        "id",
        "title",
        "url",
        "canonical_url",
        "domain",
        "source_slug",
        "source_name",
        "content_type",
        "section_path",
        "meta_description",
        "body",
        "headings",
        "language",
        "published_at",
        "last_updated_at",
        "word_count",
        "code_block_count",
        "tags",
        "boost_score",
        "authority_score",
        "freshness_status",
    ]))

    # Custom ranking rules: after standard relevance signals, favour authoritative
    # and high-quality documents among equally-matched results.
    _wait_for_task(client, index.update_ranking_rules([
        "words",
        "typo",
        "proximity",
        "attribute",
        "sort",
        "exactness",
        "authority_score:desc",
        "boost_score:desc",
    ]))

    # Facets used by the filters panel
    _wait_for_task(client, index.update_faceting_settings({"maxValuesPerFacet": 50}))


def batch_index(documents: list[dict[str, Any]]) -> int:
    if not documents:
        return 0
    client = get_client()
    _wait_for_task(client, client.index(settings.meili_index_name).add_documents(documents))
    return len(documents)
