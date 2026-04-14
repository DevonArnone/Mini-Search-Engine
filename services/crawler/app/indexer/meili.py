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

    # Fields searched when no explicit attribute target is specified.
    # Listed in priority order — matches earlier in the list rank higher.
    index.update_searchable_attributes([
        "title",
        "headings",
        "section_path",
        "source_name",
        "meta_description",
        "body",
        "tags",
    ])

    # Fields that can be used in filter expressions (e.g. source_slug = "react")
    index.update_filterable_attributes([
        "source_slug",
        "content_type",
        "domain",
        "language",
        "published_at",
        "last_updated_at",
        "tags",
        "freshness_status",
        "code_block_count",
    ])

    # Fields that can be used in explicit sort= clauses
    index.update_sortable_attributes([
        "published_at",
        "last_updated_at",
        "word_count",
        "boost_score",
        "authority_score",
        "code_block_count",
    ])

    # Fields returned in search hits (exclude large raw fields)
    index.update_displayed_attributes([
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
    ])

    # Custom ranking rules: after standard relevance signals, favour authoritative
    # and high-quality documents among equally-matched results.
    index.update_ranking_rules([
        "words",
        "typo",
        "proximity",
        "attribute",
        "sort",
        "exactness",
        "authority_score:desc",
        "boost_score:desc",
    ])

    # Facets used by the filters panel
    index.update_faceting({"maxValuesPerFacet": 50})


def batch_index(documents: list[dict[str, Any]]) -> None:
    if not documents:
        return
    get_client().index(settings.meili_index_name).add_documents(documents)
