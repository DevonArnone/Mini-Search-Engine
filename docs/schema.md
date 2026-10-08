# Schema

## PostgreSQL

### `documents`

Canonical URL and source metadata, title, description, language, tags, publish and update timestamps, content hash, word and code counts, ranking signals, freshness, and operational status.

| Status | Meaning |
|---|---|
| `stored` | Persisted, waiting to be published to the index |
| `indexed` | Its batch has been durably published (`index_published_at` records when) |
| `index_failed` | Publication failed; retried by the next crawl run or `publish_pending.py` |
| `duplicate` | Text identical to another document (`duplicate_of`); not indexed |
| `excluded` | Outside its source's configured path boundaries; not indexed |
| `gone` | The page returned 404 or 410 on a later crawl; removed from the index |

### `document_content`

One-to-one large-content storage for clean text, headings, links, schema.org JSON, and optional raw HTML. Separating this table keeps metadata queries small.

### `source_registry`

Source identity, official URL, authority, crawl cadence, document count, current crawl status, last attempt, and last successful crawl.

### `crawl_queue`

Normalized unique URL, domain, depth, source provenance, priority, retries, scheduling, processing state, completion timestamp, and `detail`: why an item was skipped or counted as a duplicate (`robots`, `out_of_scope`, `thin`, `not_html`, `canonical`, `content`, …). Workers dequeue atomically with `FOR UPDATE SKIP LOCKED`.

### `crawl_logs`

Per-attempt status code, content type, response time, error, and fetch timestamp.

### `search_analytics`

Event model with `search_id`, `event_type`, anonymous `session_id`, normalized query, filter snapshot, result count, latency, clicked document, result rank, and timestamp.

A partial unique index permits one `search` event per `search_id`; multiple linked `result_click` events are allowed.

## Native index

The searchable form of the corpus is published to `SEARCH_INDEX_DIR` as immutable batches behind a manifest. See [native-index.md](native-index.md).

## Meilisearch `documents` index (optional comparison backend)

Used only when `INDEX_TARGETS` includes `meilisearch` (crawler) and `SEARCH_BACKEND=meilisearch` (web).

- Searchable: `title`, `headings`, `section_path`, `source_name`, `meta_description`, `body`, `tags`
- Filterable: `source_slug`, `content_type`, `domain`, `language`, `published_at`, `last_updated_at`, `tags`, `freshness_status`, `code_block_count`
- Ranking: words, typo, proximity, attribute, sort, exactness, authority, quality boost

Run `python services/crawler/scripts/init_db.py` for additive PostgreSQL migrations; it is safe to rerun. `python services/crawler/scripts/init_index.py` reconciles Meilisearch settings when that backend is in use.
