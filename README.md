# Mini Search Engine

Production-style portfolio project for crawling, parsing, indexing, and searching 10,000+ HTML documents with Python, PostgreSQL, Meilisearch, and Next.js.

## Stack

- Next.js 15 + TypeScript + Tailwind CSS
- Python 3.11+ crawler and ETL service
- PostgreSQL for crawl state, metadata, and analytics
- Meilisearch for full-text search, autocomplete, and faceted filtering
- Docker Compose for local infra

## Quick Start

1. Copy `.env.example` into local env files as needed.
2. Start infrastructure with `docker compose up postgres meilisearch`.
3. Create a Python virtualenv in `services/crawler` and install `requirements.txt`.
4. Install frontend dependencies with `npm install`.
5. Run the web app with `npm run dev`.
6. Run crawler scripts from `services/crawler/scripts`.

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

See [docs/architecture.md](/Users/devonarnone/Documents/Mini Search Engine/docs/architecture.md) for data flow and [docs/api-spec.md](/Users/devonarnone/Documents/Mini Search Engine/docs/api-spec.md) for the search contract.

