#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
QUERY="${1:-search}"
ITERATIONS="${ITERATIONS:-15}"

tmp_file="$(mktemp)"

for _ in $(seq 1 "$ITERATIONS"); do
  curl -fsS "${BASE_URL}/api/search?q=${QUERY}&limit=10" >>"$tmp_file"
  printf '\n' >>"$tmp_file"
done

python3 - <<'PY' "$tmp_file" "$ITERATIONS" "$QUERY"
import json
import statistics
import sys

path, iterations, query = sys.argv[1], int(sys.argv[2]), sys.argv[3]

with open(path, "r", encoding="utf-8") as handle:
    payloads = [json.loads(line) for line in handle if line.strip()]

latencies = [payload["processingTimeMs"] for payload in payloads]
totals = [payload["totalHits"] for payload in payloads]
modes = sorted({payload["mode"] for payload in payloads})

latencies_sorted = sorted(latencies)
p95_index = max(0, min(len(latencies_sorted) - 1, round(0.95 * len(latencies_sorted)) - 1))

print(f"Benchmark query: {query}")
print(f"Samples: {iterations}")
print(f"Modes observed: {', '.join(modes)}")
print(f"Average latency: {statistics.mean(latencies):.2f}ms")
print(f"P95 latency: {latencies_sorted[p95_index]:.2f}ms")
print(f"Average total hits: {statistics.mean(totals):.2f}")
PY

rm -f "$tmp_file"
