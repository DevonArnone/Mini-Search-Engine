# Evidence

Recorded measurements for this repository, and what they do and do not support.

| File | What it records |
|---|---|
| [`corpus/corpus-report.md`](corpus/corpus-report.md) | The crawl: documents per source, fetch outcomes, duplicates excluded, and reconciliation across PostgreSQL, the index, and the running app |
| [`benchmarks/benchmark.md`](benchmarks/benchmark.md) | Warm query latency, throughput, cold start, and memory at 1,000, 5,000, 10,001, and 15,855 documents |
| [`benchmarks/hydration.md`](benchmarks/hydration.md) | CPU profile and timing trace of index hydration; cold, persistent, and incremental costs compared |
| [`benchmarks/hydration.cpuprofile`](benchmarks/hydration.cpuprofile) | The raw profile; open it in Chrome DevTools → Performance |
| [`baseline/`](baseline/) | Timings and screenshots of the previous Meilisearch-backed build, taken before this work |

## Acceptance rules and outcomes

The rules were fixed before measuring.

| Claim | Rule | Outcome |
|---|---|---|
| Sub-30 ms search | Full HTTP mean ≤ 30 ms in every warmed 10,001-document trial at concurrency 1 | **Met.** Trial means 3.4–3.6 ms |
| Latency flat at scale | 10,001-document mean no more than 25% above the 5,000-document mean | **Met.** −5.9% (3.7 ms at 5,000, 3.5 ms at 10,001) |
| 10,000+ documents | At least 10,001 unique, real, fetched-and-parsed documents; no synthetic or repeated documents | **Met.** 15,855 |
| 20,000 documents | Report where available | **Not available.** The five sources hold 15,855 in-scope pages |

Concurrency-10 results are reported separately in the benchmark and are not part of any rule.

## Statements this evidence supports

Use the measured number and its conditions. Suggested wording:

- Built a search engine from scratch in TypeScript (inverted index, field-weighted BM25, bounded top-K heap, typo recovery) serving 15,855 crawled documentation pages at 3.5 ms mean full-request latency (5.5 ms p95) at 10,001 documents on a single machine.
- Query latency stayed flat as the corpus doubled: 3.7 ms at 5,000 documents and 3.5 ms at 10,001, and 3.9 ms at 15,855.
- Designed a crawl-to-index pipeline that publishes immutable 250-document batches behind an atomically replaced manifest, marks documents indexed only after durable publication, and resumes interrupted work without duplicates.
- Profiled index hydration (87% tokenizing and building postings, 13% reading and parsing) and kept the index in a persistent worker with incremental batch updates: a query against the loaded index takes 1.5 ms where hydrating first takes 1.4 s, and a 250-document batch applies in about 55 ms instead of a full reload.

## What it does not support

- **"Under 30 ms in production."** These are single-machine measurements with the load generator on the same host. Say "on a single machine" or give the hardware.
- **A historical hydration incident.** The hydration comparison is a controlled reconstruction: the cost of loading the index before answering, measured here, against keeping it loaded. The previous build used Meilisearch and never hydrated an index. Describe it as a profiled design decision, not as a bottleneck found in production.
- **A speedup over Meilisearch.** The baseline (22.6 ms mean) was taken on a 387-document corpus with the analytics write on the response path. It differs from the current build in corpus, engine, and request path at once, so the two numbers are not a like-for-like comparison.
- **Rounding up the corpus.** It is 15,855 documents, which supports "10,000+" or "over 15,000", not "20K".
- **Relevance beyond the 18-query check.** 16 of 18 expected pages appear in the top five; there is no larger judged set.

## Regenerating

```bash
npm run build
node scripts/benchmark/run-benchmark.mjs
node scripts/benchmark/profile-hydration.mjs
python services/crawler/scripts/corpus_report.py --since <crawl start, UTC> --base-url http://localhost:3000 --out docs/evidence/corpus
```

Numbers will differ slightly between runs and machines. If a rerun changes a figure quoted in the README or above, update the wording to the new figure.
