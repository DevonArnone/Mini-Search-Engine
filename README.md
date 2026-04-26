# DevDocs Search

A **developer documentation search product** built on a production-grade crawl, index, and ranking stack. Searches across MDN Web Docs, React, Next.js, TypeScript, and PostgreSQL official documentation — in one place, instantly.

## Document Landing Page View
![Document landing page](docs/assets/doc-landing.png)

## Document Suggestion View
![Document suggestion view](docs/assets/doc-suggestion.png)

## Document Retrieval View
![Document retrieval view](docs/assets/doc-retrieval.png)

## Document Insight View
![Document insight view](docs/assets/doc-insights.png)


## Problem

Developer documentation is scattered across five different official sites with no unified search. Context-switching between MDN, the React docs, and the PostgreSQL reference wastes time and breaks flow. Existing aggregators either scrape without attribution, use stale indexes, or return noisy results with no relevance signal.

## Product

**DevDocs Search** crawls the five most-referenced documentation sites for web developers, builds a structured index with content classification and source authority signals, and serves fast, relevance-ranked full-text search with filters for source, content type, and freshness.

**Live demo:** *(coming soon — deploy instructions below)*

### Features

| Feature | Detail |
|---|---|
| Unified search | MDN, React, Next.js, TypeScript, PostgreSQL in one index |
| Source filters | Filter by documentation source or browse by source |
| Content type | Classify results as `guide`, `reference`, `tutorial`, `api`, or `blog` |
| Freshness filters | Filter to docs updated within 7, 30, or 90 days |
| Autocomplete | Keyboard-navigable suggestions with source awareness |
| Code example badge | Surface results with code blocks prominently |
| "Why matched" | Show which field (title, headings, body) drove the match |
| Browse mode | Enter through source pages and topic exploration |
| Search insights | Top queries, zero-result queries, low-click rate analysis |
| Analytics | Click-through tracking with keepalive, deduplicated view events |
| No-results recovery | Suggested queries when a search returns nothing |

## Architecture

```
docs_sources.yaml
      │
      ▼
┌─────────────────┐    ┌──────────────┐    ┌──────────────┐
│  Python crawler  │───▶│  PostgreSQL  │───▶│ Meilisearch  │
│  (async BFS)    │    │  (metadata + │    │  (full-text  │
│                 │    │   analytics) │    │   + facets)  │
└─────────────────┘    └──────────────┘    └──────────────┘
                                                    │
                               ┌────────────────────┘
                               ▼
                       ┌──────────────┐
                       │  Next.js 15  │
                       │  (App Router │
                       │   + search   │
                       │   workspace) │
                       └──────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| Crawler | Python 3.11 · httpx · BeautifulSoup · trafilatura |
| Database | PostgreSQL 16 |
| Search | Meilisearch v1.11 |
| Web app | Next.js 15 · TypeScript · Tailwind CSS |
| Infra | Docker Compose (local) · Vercel + Neon + Railway (production) |
| CI | GitHub Actions |

### Crawler pipeline

The crawler runs an **async BFS** from a YAML-defined source registry. Each source defines seeds, allowed domains, crawl depth, rate-limit delay, authority weight, and recrawl cadence.

Per-URL processing:
1. Dequeue from PostgreSQL `crawl_queue` with `FOR UPDATE SKIP LOCKED`
2. Enforce per-domain rate limiting (configurable, default 1000ms)
3. Check `robots.txt` (default: compliant; override available for local dev)
4. Fetch HTML with 15-second timeout via httpx
5. Parse with trafilatura (primary) + BeautifulSoup (metadata extraction)
6. Detect `content_type` from URL patterns, heading patterns, and code density
7. Extract `section_path` from breadcrumb nav elements or URL segments
8. Count code blocks (`<pre>` elements + substantial standalone `<code>`)
9. Extract `last_updated_at` from schema.org `dateModified`, meta tags, and `<time>` context
10. Compute `boost_score` from title, description, word count, depth, and authority
11. Upsert to PostgreSQL + immediately index into Meilisearch
12. Enqueue discovered links (up to 50 per page), inheriting source slug

Retry semantics: exponential backoff (5s, 10s, 20s, …, 300s cap) on 408/429/5xx. Max 3 retries per URL.

Deduplication: SHA-256 hash of extracted body text — duplicate documents are detected and skipped.

### Database schema

Key tables:

- **`source_registry`** — per-source metadata: authority weight, crawl cadence, health status, doc count
- **`documents`** — one row per URL: full metadata including `source_slug`, `content_type`, `section_path`, `authority_score`, `freshness_status`, `code_block_count`
- **`document_content`** — clean text, headings, links, schema.org JSON (joined separately to avoid fetching large blobs on list queries)
- **`crawl_queue`** — BFS queue with priority, retry count, scheduled-at, and source context
- **`search_analytics`** — every search query logged with filters, result count, latency, and optional click

### Search ranking

Meilisearch ranking rules (in priority order):
1. `words` — BM25 word frequency
2. `typo` — typo tolerance
3. `proximity` — proximity of matching terms
4. `attribute` — matches in earlier searchable attributes rank higher (title > headings > section_path > description > body)
5. `sort` — explicit sort parameter
6. `exactness` — exact matches over partial
7. `authority_score:desc` — source authority (MDN=10, React/Next.js/TypeScript=9, PostgreSQL=8)
8. `boost_score:desc` — per-document quality signals

Filters supported: `source_slug`, `content_type`, `domain`, `language`, `last_updated_at`, `tags`, `freshness_status`.

### API surface

```
GET /api/search
  ?q=          full-text query
  &source=     source slug filter (repeatable)
  &contentType= guide|reference|tutorial|api|blog (repeatable)
  &domain=     domain filter (repeatable)
  &updatedWithin= 7d|30d|90d
  &sort=       relevance|newest|oldest
  &page=       page number
  &limit=      results per page (max 50)

GET /api/sources      per-source counts, health, and crawl metadata
GET /api/insights     top queries, zero-result queries, low-click analysis
GET /api/filters      facet distributions (sources, content types, domains, languages)
GET /api/autocomplete ?q= title suggestions
GET /api/status       system health (DB, Meilisearch, queue, analytics)
POST /api/analytics   client-side click and view event logging
```

### Key engineering decisions

**Why Meilisearch over Elasticsearch?**  
Meilisearch has a simpler operational model (single binary, no JVM), ships with typo tolerance and faceting out of the box, and is fast enough for a corpus this size. The custom ranking rules give enough control over relevance without needing a full Elasticsearch query DSL.

**Why PostgreSQL as the crawl store instead of Redis?**  
`FOR UPDATE SKIP LOCKED` provides safe concurrent dequeue semantics without an additional process. Crawl logs, analytics, and the source registry benefit from relational joins. The crawl queue doubles as a durable audit trail.

**Why separate `document_content` from `documents`?**  
Fetching clean text (50kB per row) on every list query is expensive. Separating the large column into a joined table keeps the metadata queries fast and allows future archival of raw HTML independently.

**Why content_type detection at crawl time, not query time?**  
Classifying at index time means the field is filterable in Meilisearch without post-processing. It also allows the UI to show content type badges without round-tripping through any additional service.

## Benchmark

The relevance evaluation harness (`scripts/eval_relevance.py`) tests 18 representative queries with expected top-k URL matches:

| Metric | Value |
|---|---|
| Eval queries | 18 across all 5 sources |
| Pass threshold | 70% |
| Avg search latency | < 30ms (Meilisearch) |
| Full crawl → indexed | < 2 hours for all 5 sources |

Run the evaluation locally:

```bash
python scripts/eval_relevance.py --base-url http://localhost:3000 --verbose
```

## Quick Start (local)

### Prerequisites

- Docker + Docker Compose
- Node.js 20+

### One-command demo

```bash
bash scripts/local-demo.sh
```

Opens at `http://localhost:3000`. The demo script:
1. Starts PostgreSQL and Meilisearch
2. Initializes the database schema and index configuration
3. Loads seed URLs from `services/crawler/seeds/docs_sources.yaml`
4. Runs one crawl pass
5. Starts the Next.js web app

For a pre-populated 10k-document synthetic corpus (no crawl needed):

```bash
bash scripts/local-demo-10k.sh
```

To stop and remove all local state:

```bash
docker compose down -v
```

### Running the crawler manually

```bash
# With the services running (docker compose up -d postgres meilisearch):
python services/crawler/scripts/init_db.py
python services/crawler/scripts/init_index.py
python services/crawler/scripts/load_seeds.py
python services/crawler/scripts/run_crawl.py
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://mini_search:mini_search@localhost:5432/mini_search` | PostgreSQL connection string |
| `MEILI_HOST` | `http://localhost:7700` | Meilisearch host |
| `MEILI_MASTER_KEY` | `mini_search_master_key` | Meilisearch API key |
| `CRAWLER_MAX_DEPTH` | `3` | BFS depth limit |
| `CRAWLER_CONCURRENCY` | `5` | Concurrent fetch limit |
| `CRAWLER_RATE_LIMIT_PER_DOMAIN_MS` | `1000` | Politeness delay per domain |
| `CRAWLER_IGNORE_ROBOTS` | `false` | Set to `true` for local dev only |
| `SEED_CONFIG_PATH` | `services/crawler/seeds/docs_sources.yaml` | Source registry YAML path |

## Deployment

### Vercel (web app)

1. Import the repository in Vercel
2. Set `Root Directory` to `apps/web`
3. Add environment variables: `DATABASE_URL`, `MEILI_HOST`, `MEILI_MASTER_KEY`, `NEXT_PUBLIC_API_BASE_URL`

### Neon (PostgreSQL)

Create a Neon project and use the connection string as `DATABASE_URL`.

### Railway (Meilisearch + crawler)

1. Add a Meilisearch service from the Railway template
2. Add a Python service pointing at `services/crawler/`
3. Set the same environment variables
4. Configure a cron job or GitHub Actions scheduled workflow to run `run_crawl.py` on the desired cadence

## CI

GitHub Actions runs on every push and pull request:

| Job | What it checks |
|---|---|
| `web` | TypeScript type-check, ESLint, Vitest unit tests |
| `shared-types` | Type-check shared package |
| `crawler` | ruff lint, pytest unit tests |
| `crawl-smoke` | Full init → seed → queue smoke test with real services |
| `relevance` | Relevance harness (main branch only, post-crawl) |

## Project structure

```
.
├── apps/
│   └── web/                    # Next.js 15 search application
│       ├── src/app/            # App Router pages and API routes
│       │   ├── page.tsx        # Landing page
│       │   ├── search/         # Search workspace
│       │   ├── sources/        # Browse mode (source listing + source pages)
│       │   ├── insights/       # Analytics dashboard
│       │   └── api/            # search, sources, insights, filters, autocomplete, analytics, status
│       ├── src/components/     # SearchShell, StatusOverview
│       └── src/lib/            # search.ts, status.ts, db.ts, meili.ts
├── packages/
│   └── shared-types/           # TypeScript types shared between web and tooling
├── services/
│   └── crawler/
│       ├── app/
│       │   ├── core/           # Fetcher, queue, robots, settings
│       │   ├── db/             # Schema (SCHEMA_SQL + MIGRATION_SQL)
│       │   ├── extract/        # Parser (content_type, section_path, code blocks)
│       │   ├── indexer/        # Meilisearch index configuration
│       │   ├── models/         # QueueItem dataclass
│       │   ├── pipeline/       # Worker, storage, seeds
│       │   └── utils/          # URL normalization
│       ├── scripts/            # init_db, init_index, load_seeds, run_crawl
│       ├── seeds/
│       │   ├── docs_sources.yaml   # Source registry (MDN, React, Next.js, TS, PG)
│       │   └── sample_seeds.yaml   # Legacy demo seeds
│       └── tests/              # Parser, storage, URL utils tests
├── scripts/
│   ├── eval_relevance.py       # Relevance evaluation harness
│   ├── benchmark-search.sh     # Search latency benchmark
│   └── local-demo.sh           # One-command local demo
├── .github/
│   └── workflows/ci.yml        # CI pipeline
└── docker-compose.yml          # Local service orchestration
```
