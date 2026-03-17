#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up --build -d postgres meilisearch web

until docker compose exec -T postgres pg_isready -U mini_search -d mini_search >/dev/null 2>&1; do
  sleep 1
done

until curl -fsS http://localhost:7700/health >/dev/null 2>&1; do
  sleep 1
done

source .venv/bin/activate
python services/crawler/scripts/init_db.py
python services/crawler/scripts/init_index.py
python services/crawler/scripts/generate_demo_corpus.py --count 10000

cat <<'EOF'

10k local demo is ready.
Open http://localhost:3000/search

Verification:
  curl "http://localhost:3000/api/status"
  bash scripts/benchmark-search.sh

Cleanup:
  docker compose down -v
EOF
