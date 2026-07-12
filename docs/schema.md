# Schema

## PostgreSQL

### `documents`

Canonical URL and source metadata, title/description/language, publish/update timestamps, content hash, word/code counts, ranking signals, freshness, and operational status.

Operational status progresses from `stored` to `indexed`; failed Meilisearch tasks use `index_failed`.

### `document_content`

One-to-one large-content storage for clean text, headings, links, schema.org JSON, and optional raw HTML. Separating this table keeps metadata queries small.

### `source_registry`

Source identity, official URL, authority, crawl cadence, document count, current crawl status, last attempt, and last successful crawl.

### `crawl_queue`

Normalized unique URL, domain, depth, source provenance, priority, retries, scheduling, processing state, and completion timestamp. Workers dequeue atomically with `FOR UPDATE SKIP LOCKED`.

### `crawl_logs`

Per-attempt status code, content type, response time, error, and fetch timestamp.

### `search_analytics`

Event model with `search_id`, `event_type`, anonymous `session_id`, normalized query, filter snapshot, result count, latency, clicked document, result rank, and timestamp.

A partial unique index permits one `search` event per `search_id`; multiple linked `result_click` events are allowed.

## Meilisearch `documents` Index

- Searchable: `title`, `headings`, `section_path`, `source_name`, `meta_description`, `body`, `tags`
- Filterable: `source_slug`, `content_type`, `domain`, `language`, `published_at`, `last_updated_at`, `tags`, `freshness_status`, `code_block_count`
- Sortable: `published_at`, `last_updated_at`, `word_count`, `boost_score`, `authority_score`, `code_block_count`
- Ranking: words, typo, proximity, attribute, sort, exactness, authority, quality boost

Run `python services/crawler/scripts/init_db.py` for additive PostgreSQL migrations and `python services/crawler/scripts/init_index.py` to reconcile Meilisearch settings. Both are safe to rerun.
