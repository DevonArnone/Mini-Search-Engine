# Architecture

## Data Flow

1. The YAML source registry defines official seeds, allowed domains, authority, depth, cadence, and rate limits.
2. Seed loading validates the configuration, upserts source metadata, and enqueues URLs in PostgreSQL.
3. Workers dequeue with `FOR UPDATE SKIP LOCKED`, enforce robots policy and per-domain delay, then fetch and parse HTML.
4. Extraction records normalized metadata, clean text, headings, links, classification, freshness, and quality signals.
5. PostgreSQL stores a document as `stored`; Meilisearch receives the searchable payload and must confirm its task.
6. A successful task marks the document `indexed`. A failed task marks it `index_failed` and triggers queue retry handling.
7. The Next.js API queries Meilisearch for retrieval and PostgreSQL for sources, status, and analytics.
8. The browser keeps search state in the URL and reports result clicks against server-generated search IDs.

## Ownership

- PostgreSQL is the source of truth for queue state, source health, document metadata/content, and analytics events.
- Meilisearch owns query-time text retrieval, facets, highlighting, and explicit date sorting.
- The Python service owns source policy, crawling, extraction, persistence, and index synchronization.
- Next.js owns validated public APIs, service-state translation, and the browser experience.

Server-rendered pages call shared services directly. They do not call the application's own HTTP routes, avoiding build-time host assumptions and redundant network hops.

## Search State

The URL is the canonical browser search state. Supported state includes query, page, page size, source, content type, domain, language, tags, sort, date range, and freshness window. Parsing clamps pagination, removes invalid enum values, deduplicates filters, and bounds list lengths.

Autocomplete is debounced independently. A failed autocomplete or facet request does not discard valid search results. Stale requests are aborted, previous results remain visible during refresh, and pagination is bounded by `totalHits`.

## Analytics

`search_analytics` is an event table:

- `search` records represent one completed non-empty live query.
- `result_click` records reference the producing `search_id`, document, and rank.
- Random HTTP-only session IDs support anonymous aggregation.

Insight queries filter by `event_type`, preventing click events from inflating search totals. Click-through is calculated from distinct searches with at least one click.

## Failure Modes

- Meilisearch unavailable: search APIs return structured `503`; source and status pages remain available from PostgreSQL.
- PostgreSQL unavailable: live search can continue, analytics are skipped, and source/insight views identify unavailable metrics.
- Facets unavailable: known source filters remain usable without live counts.
- Index task failure: document stays out of indexed counts and the queue follows retry policy.
- Interrupted worker: stale `processing` rows are returned to `pending` before the next run.
- Demo mode: enabled only with `SEARCH_DEMO_MODE=true` and always labeled in the UI.

## Operational Checks

`GET /api/status` reports independent database and search health, indexed documents, queue depth, crawl failures, duplicate groups, source status, and generation time. Compare PostgreSQL indexed counts with Meilisearch document counts when diagnosing drift.
