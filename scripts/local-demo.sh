#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up --build -d postgres meilisearch web
docker compose build crawler-job

until docker compose exec -T postgres pg_isready -U mini_search -d mini_search >/dev/null 2>&1; do
  sleep 1
done

until curl -fsS http://localhost:7700/health >/dev/null 2>&1; do
  sleep 1
done

docker compose run --rm crawler-job

cat <<'EOF'

Local demo is ready.
Open http://localhost:3000/search

Useful commands:
  docker compose logs -f web
  docker compose logs -f crawler-job
  docker compose down -v
EOF
