# Search benchmark

Recorded 2026-10-08T16:53:16.977Z at commit `a3b8dbf` (uncommitted changes present), production build `LapUVaQT8eUkxtmVpxR85`.

## Conditions

- Hardware: Apple M1 Pro, 10 logical cores, 16 GB RAM. Client and server on the same machine.
- Software: Darwin 25.6.0 arm64; Node v25.2.1; Next.js 15.5.20; React 19.2.4; PostgreSQL 16 (Docker, localhost).
- Server: `next start` (production build), native backend, one engine worker. Analytics writes enabled and deferred until after the response.
- Each trial: fresh server process, 100 warm-up requests, then 500 measured requests per concurrency level (1 and 10).
- Query set: 40 fixed queries (6 common, 6 rare, 8 multi-word, 7 filter, 4 pagination, 5 typo, 4 zero-results), defined in `scripts/benchmark/queries.json`.
- Corpora: deterministic nested samples of the real crawled documents, exported from PostgreSQL. No synthetic documents.
- HTTP time is measured by the client around the whole request, including reading and parsing the JSON body. Engine time is the search engine's own execution time as reported in the response.

## Warm query latency

| Documents | Trial | Concurrency | HTTP mean (ms) | HTTP p50 | HTTP p95 | Engine mean (ms) | Engine p95 | Throughput (req/s) | Errors |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 1 | 1 | 2.968 | 2.899 | 5.009 | 1.05 | 2.645 | 336.5 | 0 |
| 1,000 | 1 | 10 | 11.866 | 12.153 | 18.159 | 1.098 | 2.754 | 832.1 | 0 |
| 1,000 | 2 | 1 | 3.362 | 3.112 | 5.657 | 1.098 | 2.715 | 297.1 | 0 |
| 1,000 | 2 | 10 | 13.087 | 12.808 | 22.744 | 1.201 | 2.987 | 729.5 | 0 |
| 1,000 | 3 | 1 | 3.081 | 2.844 | 5.071 | 1.066 | 2.693 | 324 | 0 |
| 1,000 | 3 | 10 | 14.087 | 13.016 | 29.082 | 1.217 | 2.911 | 702.3 | 0 |
| 5,000 | 1 | 1 | 3.539 | 3.271 | 5.732 | 1.581 | 3.468 | 282.3 | 0 |
| 5,000 | 1 | 10 | 15.726 | 16.603 | 22.229 | 1.546 | 3.349 | 628.3 | 0 |
| 5,000 | 2 | 1 | 4.041 | 3.319 | 6.486 | 1.869 | 4.007 | 247.3 | 0 |
| 5,000 | 2 | 10 | 19.056 | 20.317 | 28.144 | 1.873 | 4.171 | 518.5 | 0 |
| 5,000 | 3 | 1 | 3.48 | 3.197 | 5.632 | 1.562 | 3.393 | 287.2 | 0 |
| 5,000 | 3 | 10 | 15.599 | 16.514 | 22.401 | 1.531 | 3.399 | 633.7 | 0 |
| 10,001 | 1 | 1 | 3.627 | 3.382 | 5.766 | 1.576 | 3.304 | 275.4 | 0 |
| 10,001 | 1 | 10 | 15.181 | 15.169 | 21.631 | 1.486 | 3.208 | 653.2 | 0 |
| 10,001 | 2 | 1 | 3.433 | 3.081 | 5.505 | 1.522 | 3.263 | 291 | 0 |
| 10,001 | 2 | 10 | 15.736 | 15.388 | 22.683 | 1.535 | 3.343 | 630.5 | 0 |
| 10,001 | 3 | 1 | 3.352 | 3.078 | 5.269 | 1.526 | 3.182 | 298 | 0 |
| 10,001 | 3 | 10 | 14.895 | 14.745 | 21.498 | 1.458 | 3.151 | 665.9 | 0 |
| 15,855 | 1 | 1 | 4.234 | 3.756 | 6.498 | 1.767 | 3.273 | 236 | 0 |
| 15,855 | 1 | 10 | 18.268 | 17.445 | 26.577 | 1.785 | 3.346 | 542.9 | 0 |
| 15,855 | 2 | 1 | 3.547 | 3.468 | 5.199 | 1.664 | 3.19 | 281.7 | 0 |
| 15,855 | 2 | 10 | 16.602 | 16.475 | 21.838 | 1.626 | 3.124 | 597.2 | 0 |
| 15,855 | 3 | 1 | 3.809 | 3.496 | 5.557 | 1.709 | 3.165 | 262.3 | 0 |
| 15,855 | 3 | 10 | 16.817 | 16.755 | 22.247 | 1.65 | 3.177 | 589.4 | 0 |
| 20,000 | — | — | not available: the crawled corpus holds 15,855 documents | | | | | | |

## Cold start and memory

| Documents | Trial | Engine hydration (ms) | Spawn to searchable (ms) | Server RSS after load (MB) | Engine heap used (MB) | Engine off-heap (MB) | Index terms |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 1 | 202 | 1048.1 | 409.1 | 34.9 | 13.9 | 16,868 |
| 1,000 | 2 | 938 | 1610.5 | 368.7 | 42.2 | 13.9 | 16,868 |
| 1,000 | 3 | 175 | 745 | 416.4 | 48.5 | 13.9 | 16,868 |
| 5,000 | 1 | 853 | 1391.1 | 503.3 | 60.2 | 62.5 | 44,311 |
| 5,000 | 2 | 913 | 1483.3 | 499.1 | 97.4 | 65.4 | 44,311 |
| 5,000 | 3 | 748 | 1291.4 | 481.9 | 83.4 | 66.9 | 44,311 |
| 10,001 | 1 | 1752 | 2310.1 | 534.2 | 91.1 | 108.7 | 64,162 |
| 10,001 | 2 | 1722 | 2253.9 | 520.1 | 95.5 | 135.6 | 64,162 |
| 10,001 | 3 | 1674 | 2192 | 483.5 | 95.5 | 135.6 | 64,162 |
| 15,855 | 1 | 2437 | 2938.5 | 592.6 | 110.5 | 186.8 | 80,990 |
| 15,855 | 2 | 2369 | 2877.2 | 583.9 | 131.5 | 181.8 | 80,990 |
| 15,855 | 3 | 2592 | 3129.6 | 581.3 | 129.7 | 179.3 | 80,990 |

## Acceptance

- **thirtyMs** — full HTTP mean latency <= 30 ms in every warmed 10,001-document trial at concurrency 1: **ACCEPTED**; trial means 3.627, 3.433, 3.352 ms.
- **flatAtScale** — 10,001-document mean no more than 25% above the 5,000-document mean (concurrency 1, mean of trial means): **ACCEPTED**; 5K 3.687 ms, 10,001 3.471 ms (-5.9%).

Concurrency-10 results are reported above and are not part of either acceptance rule.
