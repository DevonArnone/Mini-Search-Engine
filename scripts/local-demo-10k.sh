#!/usr/bin/env bash
# Runs the web application against the SYNTHETIC 10K fixture.
#
# The fixture is generated test data for exercising the engine at a fixed
# size. It is kept in its own index directory, separate from the crawled
# corpus, and is not evidence of crawl scale.
set -euo pipefail

cd "$(dirname "$0")/.."

FIXTURE_DIR="$PWD/data/search-index-synthetic"

source .venv/bin/activate
python services/crawler/scripts/generate_demo_corpus.py --count 10000 --out "$FIXTURE_DIR"

npm run build

cat <<EOF_MESSAGE

Synthetic 10K fixture is ready in $FIXTURE_DIR
Starting the web server against it on http://localhost:3000 (Ctrl+C to stop).

Remove the fixture afterwards:
  python services/crawler/scripts/clear_demo_corpus.py
EOF_MESSAGE

SEARCH_BACKEND=native SEARCH_INDEX_DIR="$FIXTURE_DIR" npm run start
