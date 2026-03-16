# Architecture

## Data Flow

1. Seed URLs are loaded into `crawl_queue`.
2. The crawler worker dequeues pending URLs, checks robots rules, and fetches HTML.
3. The extraction pipeline normalizes metadata, builds cleaned text, hashes content, and persists document records.
4. Searchable payloads are indexed into Meilisearch in batches.
5. The Next.js API layer queries Meilisearch directly for search, autocomplete, and facet counts.
6. Search latency and click events are logged into PostgreSQL through the analytics endpoint.

## Services

- PostgreSQL stores source-of-truth crawl state, document metadata, and analytics.
- Meilisearch serves query-time search and autocomplete.
- The Python service owns offline ingestion and indexing.
- The Next.js app owns the public API surface and the search UX.

## Reliability Notes

- Queue entries track retries, scheduling, and processing states.
- Content hashes prevent duplicate indexing.
- Per-domain politeness settings reduce bursty traffic.
- Search avoids live Postgres joins to keep latency stable.

