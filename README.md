# Mini Search Engine

Production-style portfolio project for crawling, parsing, indexing, and searching 10,000+ HTML documents with Python, PostgreSQL, Meilisearch, and Next.js.

## Stack

- Next.js 15 + TypeScript + Tailwind CSS
- Python 3.11+ crawler and ETL service
- PostgreSQL for crawl state, metadata, and analytics
- Meilisearch for full-text search, autocomplete, and faceted filtering
- Docker Compose for local infra

## Quick Start

1. Run `bash scripts/local-demo.sh`
2. Open `http://localhost:3000/search`

For local setup, `CRAWLER_IGNORE_ROBOTS=true` is enabled in `.env.example` so the sample seeds can index immediately. Set it to `false` for stricter real crawling.

## Local Docker Demo

This repo supports a one-command local demo:

```bash
bash scripts/local-demo.sh
```

That command:

- starts PostgreSQL
- starts Meilisearch
- builds and starts the Next.js web app
- initializes the database
- configures the Meilisearch index
- loads sample seeds
- runs the crawler once

For a full synthetic corpus demo with `10,000` indexed documents:

```bash
bash scripts/local-demo-10k.sh
```

To stop and clean local state:

```bash
docker compose down -v
```

## Project Structure

- `apps/web`: Next.js search UI and API routes
- `services/crawler`: Python crawl, parse, ETL, and indexing service
- `docs`: architecture and API docs
- `infra`: local infra-related assets

## Core Features

- Seed-driven crawling with per-domain limits and robots.txt support
- Durable crawl queue and metadata persistence in PostgreSQL
- Clean-content extraction, dedupe hashing, and batch indexing to Meilisearch
- Search API with autocomplete, filters, pagination, and analytics logging
- Responsive frontend with URL-synced query state and result highlighting

## Scripts

- `npm run dev`: start the Next.js app
- `npm run build`: production build for the web app
- `npm run test`: frontend unit tests
- `npm run test:e2e`: Playwright end-to-end tests
- `python services/crawler/scripts/init_db.py`: initialize schema
- `python services/crawler/scripts/init_index.py`: configure Meilisearch index
- `python services/crawler/scripts/load_seeds.py`: enqueue sample seeds
- `python services/crawler/scripts/run_crawl.py`: run crawl worker
- `python services/crawler/scripts/generate_demo_corpus.py --count 10000`: create a synthetic local corpus without adding files to the repo
- `bash scripts/local-demo-10k.sh`: start the web stack and seed a 10k local corpus
- `bash scripts/benchmark-search.sh`: sample `/api/search` latency and print average and p95 timings

See [docs/architecture.md](/Users/devonarnone/Documents/Mini Search Engine/docs/architecture.md) for data flow and [docs/api-spec.md](/Users/devonarnone/Documents/Mini Search Engine/docs/api-spec.md) for the search contract.

## Generate A 10k Corpus

If you want a defensible `10,000+ documents` claim for local demos, generate the corpus into PostgreSQL and Meilisearch instead of committing files into Git.

1. Start PostgreSQL and Meilisearch.
2. Run `python services/crawler/scripts/init_db.py`
3. Run `python services/crawler/scripts/init_index.py`
4. Run `python services/crawler/scripts/generate_demo_corpus.py --count 10000`

The generated data lives in local database and search index storage, not in the repository. If you are using Docker Compose, `docker compose down -v` removes the generated corpus.

Expected result:

- `/api/status` reports roughly `10,000` indexed documents
- the home page and search page show live corpus counts and top domains
- `bash scripts/benchmark-search.sh` prints average and p95 search latency

## Benchmarking

Use the built-in benchmark script after the app and search services are running:

```bash
bash scripts/benchmark-search.sh
```

Example output shape:

```text
Benchmark query: search
Samples: 15
Modes observed: live
Average latency: 12.40ms
P95 latency: 18.00ms
Average total hits: 10000.00
```

## Dedupe Reporting

The status dashboard now reports duplicate document counts and duplicate content groups based on `content_hash`, so you can verify when the corpus contains redundant content rather than only relying on a hidden dedupe field in the database.
