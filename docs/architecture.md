# Architecture

## Data flow

1. The YAML source registry defines each official source: seeds, sitemaps, allowed domains and path prefixes, authority, depth, cadence, and rate limit.
2. Seed loading validates the registry, upserts source metadata, and enqueues seed and in-scope sitemap URLs in PostgreSQL.
3. The crawler dequeues with `FOR UPDATE SKIP LOCKED`, taking one URL from every site before a second from any. It checks scope and `robots.txt`, waits for the site's rate-limit slot, then fetches.
4. Extraction produces title, headings, body text, section path, dates, content type, and a content hash. The document is stored under its canonical URL; a page whose text duplicates an existing document is kept as `duplicate` and not indexed.
5. PostgreSQL records the document as `stored` and the crawler hands its id to the batch publisher through a bounded queue.
6. The publisher groups up to 250 documents, reads them back from PostgreSQL, writes one immutable batch file, and replaces the manifest atomically. Only then are the documents marked `indexed`.
7. The search engine worker inside the web server notices the new manifest and applies the batch to its in-memory index.
8. The Next.js API answers searches from that index and reads sources, status, and analytics from PostgreSQL.

```text
source registry (YAML)
        |
        v
Python crawler ──> PostgreSQL ──> batch publisher ──> SEARCH_INDEX_DIR
 robots, scope,     source of       ≤250 docs/batch     manifest.json
 rate limits,       truth           fsync + rename      batches/*.jsonl
 dedup, retries                                               |
                                                              v
                              Next.js server ── worker thread: inverted index + BM25
                                    |
                                    v
                             search interface
```

## Ownership

- **PostgreSQL** is the source of truth for queue state, source health, document metadata and content, and analytics. The index can always be rebuilt from it.
- **The index directory** holds the published form of the corpus. It has one writer at a time (guarded by a lock file) and any number of readers.
- **The search engine** (`packages/search-engine`) owns tokenization, postings, ranking, filtering, highlighting, autocomplete, and typo recovery.
- **The crawler** owns source policy, fetching, extraction, persistence, and publication.
- **Next.js** owns validated public APIs, service-state translation, and the browser experience.

Server-rendered pages call shared services directly rather than the application's own HTTP routes.

## Retrieval engine

One worker thread per server process hydrates the index once and keeps it in memory. Requests are messages to that worker and are answered in arrival order on a single thread, so searches and index updates are serialized by construction.

- **Tokens** are maximal runs of letters and digits, lowercased and NFKD-folded. Tokens longer than 64 characters are dropped.
- **Postings** map each term to the documents containing it, with a term frequency per field packed alongside.
- **Ranking** is field-weighted BM25 (BM25F) with `k1 = 1.2` and `b = 0.75`. Field weights: title 4, headings 2, description 2, body, tags, section, and source name 1. Weights apply before saturation. Source authority only orders documents whose scores are exactly equal; document id breaks any remaining tie so order is repeatable.
- **Matching** requires every query term. If no document holds them all, terms the index has never seen are replaced by a bounded set of prefix completions and near spellings (edit distance 1 for 4–7 characters, 2 for longer; same first character; a handful of candidates) at a score penalty. If that still matches nothing, documents matching any term are ranked.
- **Selection** keeps the requested page in a bounded heap of `page × limit` entries; `totalHits` is an exact count.
- **Highlights and snippets** are built from escaped text with literal `<em>` tags, so page content can never reach the browser as markup.

`SEARCH_BACKEND=native|meilisearch` selects the backend when the process starts. A failing backend returns `503`; the application never switches to the other one.

## Index updates and consistency

- Batch files are immutable and checksummed. A batch is visible only through a manifest that lists it, and the manifest is replaced with write-to-temp, `fsync`, rename.
- The worker polls the manifest. New batches are applied one per event-loop turn, each synchronously, so a search sees the index before or after a batch and never between.
- A batch is fully read, size-checked, checksummed, and parsed before any of it is applied. A corrupt or incomplete batch stops the sync at the previous revision, is reported in `/api/status`, and is retried.
- A rebuild or compaction writes a new *generation*. The worker hydrates the new generation beside the old one and swaps when it is complete.
- Replacing or deleting a document leaves tombstoned postings that are skipped at query time; corpus statistics are corrected immediately. When tombstones exceed a quarter of live documents the worker rebuilds its postings in memory.
- Responses carry `indexRevision` (`<generation>.<last applied batch>`), identifying the exact state that produced them.

See [native-index.md](native-index.md) for the on-disk format and the rebuild, compaction, and recovery commands.

## Publication and recovery

- Documents are `stored` before publication and `indexed` after it. A failed publication marks the batch `index_failed`.
- A crawl run starts by publishing anything left `stored` or `index_failed`, so an interrupted run resumes without losing or duplicating documents: publishing a document again replaces it.
- Blocking work (PostgreSQL, HTML parsing, `robots.txt`, index writes) runs in worker threads. The hand-off queue to the publisher is bounded, so a slow disk or database slows fetching instead of growing memory.
- Queue retries use capped exponential backoff, and the worker waits for a scheduled retry rather than ending the run with work pending.

## Search state

The URL is the canonical browser search state: query, page, page size, source, content type, domain, language, tags, sort, date range, and freshness window. Parsing clamps pagination, drops invalid enum values, deduplicates filters, and bounds list lengths. Submitting a query, changing a filter, or changing page pushes a history entry.

A source workspace (`/sources/[slug]`) always searches its own source. The source is implied by the route, is not carried in the query string, and cannot be changed by a crafted URL or by clearing filters.

## Analytics

`search_analytics` is an event table:

- `search` records one submitted, non-empty live query with its result count and server-side latency.
- `result_click` records reference the producing `search_id`, document, and rank.

The search event is written after the response is sent (`after()` from `next/server`). Because a click can arrive first, each pending write is registered in process; the click endpoint waits for it, then retries briefly in case another process served the search, and answers `404` if no search event exists.

Insights use whole UTC calendar days over a 7, 30, or 90-day window. Period percentiles are computed from the underlying events. A click is attributed to the day and period of the search it followed.

## Failure modes

- Index missing, loading, or failed: search APIs return `503`; `/api/status` reports the engine state; source and insight pages keep working from PostgreSQL.
- PostgreSQL unavailable: search continues; analytics are dropped; source and insight views show unavailable states.
- Engine worker crash: in-flight requests fail with `503` and the next request starts a new worker, which rehydrates from disk.
- Request timeout: a search that is not answered within `SEARCH_TIMEOUT_MS` returns `503`.
- Demo mode: only with `SEARCH_DEMO_MODE=true`, always labeled in the interface.

## Deployment

The engine needs a long-lived Node process (to keep the index in memory) and a filesystem path shared with the crawler (`SEARCH_INDEX_DIR`). Docker Compose provides both: the `web` container mounts the `search_index` volume read-only and the crawler mounts it read-write.

This design does not fit serverless functions as it stands: each cold instance would hydrate the whole index before answering, and instances do not share a writable volume. Running there would need the index packaged with the deployment or fetched from object storage, and a plan for cold-start hydration.
