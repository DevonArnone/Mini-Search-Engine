# Index hydration: profile and comparison

Recorded 2026-10-08T16:54:47.190Z on Apple M1 Pro (10 logical cores, 16 GB), Node v25.2.1.
Index: `data/bench/10001` — 10,001 documents, 64,162 distinct terms.

This is a controlled measurement of the engine in a standalone Node process. It
quantifies the cost of loading the index before a query can be answered, and
what keeping the index loaded avoids. It is a reconstructed comparison, not a
record of a production incident.

## Where hydration time goes

One cold hydration under the V8 sampling profiler (`hydration.cpuprofile`, loadable in Chrome DevTools) took 1713.2 ms.

Timing trace per phase, summed over 41 batches:

| Phase | Time (ms) | Share |
|---|---:|---:|
| Read, checksum, and parse batch files | 211.6 | 12.8% |
| Tokenize and build postings | 1439.6 | 87.2% |

Top functions by self time:

| Function | Self time (ms) | Share of samples |
|---|---:|---:|
| `upsert — inverted-index.js` | 809.3 | 46.5% |
| `add — inverted-index.js` | 135 | 7.8% |
| `scan — tokenizer.js` | 106.4 | 6.1% |
| `isAsciiWord — tokenizer.js` | 104.7 | 6% |
| `parseBatch — store.js` | 101.2 | 5.8% |
| `(garbage collector)` | 94.7 | 5.4% |
| `tokenize — tokenizer.js` | 81.3 | 4.7% |
| `slice — node:buffer` | 55.9 | 3.2% |
| `utf8Write — buffer` | 41.5 | 2.4% |
| `read` | 30.4 | 1.7% |
| `fold — tokenizer.js` | 22.1 | 1.3% |
| `update — hash` | 19.8 | 1.1% |

## Cost of each approach

| Approach | What is paid | Measured |
|---|---|---:|
| Cold (baseline) | Hydrate the full index, then answer one query | 1399.8 ms (mean of 5 runs: 1520.6, 1391.1, 1370.9, 1357.2, 1359) |
| Persistent | Answer from the already loaded index | 1.453 ms mean, 3.109 ms p95 over 2,000 queries |
| Incremental | Apply one published batch of 250 replacements to the loaded index | 55.3 ms mean (49.1, 53.3, 60.7, 53.8, 59.6) |

- A query that has to hydrate first costs about 963× a query against the persistent index.
- Applying a 250-document batch costs about 1/25.3 of a full hydration, so new documents do not require reloading the index.
- Each replacement tokenizes the outgoing and the incoming version. When tombstoned documents exceed a quarter of the live ones the engine rebuilds its postings in memory; batches where that happened are marked above and excluded from the batch mean.

Engine times here exclude HTTP; see `benchmark.md` for full request latency.
