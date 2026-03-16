from __future__ import annotations

from typing import Any

import meilisearch

from app.core.settings import settings


def get_client() -> meilisearch.Client:
    return meilisearch.Client(settings.meili_host, settings.meili_master_key)


def configure_index() -> None:
    client = get_client()
    client.create_index(settings.meili_index_name, {"primaryKey": "id"})
    index = client.index(settings.meili_index_name)
    index.update_searchable_attributes(
        ["title", "headings", "meta_description", "body", "tags"]
    )
    index.update_filterable_attributes(["domain", "language", "published_at", "tags"])
    index.update_sortable_attributes(["published_at", "word_count", "boost_score"])
    index.update_displayed_attributes(
        [
            "title",
            "url",
            "meta_description",
            "body",
            "domain",
            "published_at",
            "tags",
            "language",
        ]
    )


def batch_index(documents: list[dict[str, Any]]) -> None:
    if not documents:
        return
    get_client().index(settings.meili_index_name).add_documents(documents)

