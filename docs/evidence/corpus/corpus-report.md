# Corpus report

Generated 2026-10-08T16:14:36+00:00 for the crawl started 2026-10-07T18:04:00+00:00.

**15,855 unique documents are indexed**, each fetched from an official site and parsed by the crawler.

- Distinct URLs: 15,855. Distinct content hashes: 15,855.
- Synthetic or generated documents among them: 0.
- Fetched during this crawl: 15,854. Oldest fetch 2026-07-12T22:10:01.418217, newest 2026-10-08T00:08:04.023707 (UTC).

## By source

| Source | Indexed | Awaiting publication | Duplicate content | Out of scope | Gone |
|---|---:|---:|---:|---:|---:|
| mdn | 13,572 | 0 | 1 | 1 | 0 |
| nextjs | 678 | 0 | 0 | 2 | 0 |
| postgresql | 1,142 | 0 | 6 | 162 | 0 |
| react | 204 | 0 | 0 | 4 | 0 |
| typescript | 259 | 0 | 0 | 6 | 0 |

## Fetch outcomes

16,012 requests between 2026-10-07T18:07:15.279264 and 2026-10-08T00:08:14.896567 (UTC); mean response 229 ms.

| Outcome | Requests |
|---|---:|
| 2xx | 15,913 |
| network or parse error | 97 |
| 4xx | 2 |

| Domain | Requests | Average rate (requests/s) |
|---|---:|---:|
| developer.mozilla.org | 13,576 | 0.63 |
| www.postgresql.org | 1,152 | 0.3 |
| nextjs.org | 707 | 0.21 |
| www.typescriptlang.org | 270 | 0.65 |
| react.dev | 210 | 0.91 |

## Queue outcomes

| Status | Reason | URLs |
|---|---|---:|
| done | — | 15,860 |
| skipped | depth | 977 |
| skipped | out_of_scope | 190 |
| skipped | not_html | 8 |
| duplicate | content | 7 |
| duplicate | canonical | 6 |
| skipped | thin | 3 |
| failed | gone | 2 |
| skipped | redirected_out_of_scope | 2 |

## Duplicates excluded

- 6 URLs resolved to a canonical URL that was already stored.
- 7 pages had text identical to an already stored document and were kept out of the index.

## Reconciliation

| Store | Documents |
|---|---:|
| PostgreSQL, status `indexed` | 15,855 |
| Native index, live documents (64 batches, generation `g1a11c49584ce8c513`) | 15,855 |
| Web application `/api/status` (revision `g1a11c49584ce8c513.64`) | 15,855 |

Counts agree: **yes**.

## Configuration

- User agent: `MiniSearchBot/1.0 (+https://github.com/DevonArnone/Mini-Search-Engine)`
- robots.txt respected: yes
- Concurrency 5, up to 3 retries, pages under 20 words skipped, index batches of up to 250.

| Source | Domains | Paths | Delay per request | Sitemaps |
|---|---|---|---:|---|
| mdn | developer.mozilla.org | /en-US/docs/Web/, /en-US/docs/Learn_web_development/, /en-US/docs/Glossary/, /en-US/docs/WebAssembly/ | 1000 ms | 1 |
| react | react.dev | /learn, /reference, /blog | 1000 ms | 0 |
| nextjs | nextjs.org | /docs, /learn, /blog | 1000 ms | 1 |
| typescript | www.typescriptlang.org | /docs/, /tsconfig | 1000 ms | 1 |
| postgresql | www.postgresql.org | /docs/current/ | 1000 ms | 1 |
