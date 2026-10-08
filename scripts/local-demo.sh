#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up --build -d postgres web
docker compose build crawler-job

until docker compose exec -T postgres pg_isready -U mini_search -d mini_search >/dev/null 2>&1; do
  sleep 1
done

# Crawls the real documentation sources and publishes index batches to the
# volume the web server reads. Interrupt and rerun at any time; it resumes.
docker compose run --rm crawler-job

cat <<'EOF_MESSAGE'

Local demo is ready.
Open http://localhost:3000/search

Useful commands:
  docker compose logs -f web
  docker compose logs -f crawler-job
  docker compose down -v
EOF_MESSAGE
