# API Contracts

All responses are JSON. Invalid requests use HTTP `400`; unavailable dependencies use `503`; unexpected failures use `500`.

```json
{
  "error": {
    "code": "invalid_request",
    "message": "One or more request values are invalid.",
    "details": {}
  }
}
```

## `GET /api/search`

| Parameter | Rules |
|---|---|
| `q` | String, maximum 200 characters |
| `page` | Integer, 1-10,000; default 1 |
| `limit` | Integer, 1-50; default 10 |
| `source` | Repeatable, maximum 20 values |
| `contentType` | Repeatable: `guide`, `reference`, `tutorial`, `api`, `blog` |
| `domain`, `language`, `tags` | Repeatable, maximum 20 values each |
| `updatedWithin` | `7d`, `30d`, or `90d` |
| `sort` | `relevance`, `newest`, or `oldest` |
| `from`, `to` | `YYYY-MM-DD`; start must not exceed end |

The response contains query and page metadata, `totalHits` (an exact count), `processingTimeMs`, `mode`, `backend`, `indexRevision`, recovery suggestions, and result records. A non-empty live query includes `searchId` for click attribution.

| Field | Meaning |
|---|---|
| `processingTimeMs` | Time spent inside the search engine for this query. It excludes request handling and serialization; measure full HTTP latency at the client. |
| `backend` | `native`, `meilisearch`, or `demo`: the engine that answered. |
| `indexRevision` | `<generation>.<batch>` of the index state that produced the results; `null` for backends that do not version their index. |
| `results[].score` | BM25 relevance score, for inspection. Native backend only. |
| `results[].whyMatched` | Fields in which query terms were found. |
| `results[].snippet`, `results[].highlights` | HTML-escaped text in which matches are wrapped in `<em>`. No other markup is ever present. |

`from` and `to` are inclusive UTC calendar days applied to the publication date; undated documents never match a date bound. `sort=newest|oldest` orders by publication date with undated documents last.

## `GET /api/autocomplete?q=`

Accepts a query up to 100 characters and returns up to six unique title suggestions. Suggestion failure is independent from search failure.

## `GET /api/filters`

Returns facet values and counts for source, content type, domain, language, and tags.

## `POST /api/analytics`

Records a result click:

```json
{
  "searchId": "uuid",
  "clickedDocumentId": "uuid",
  "resultRank": 4
}
```

The server copies query, filter, and result metadata from the linked `search` event and associates the random HTTP-only session cookie when available. Search events are persisted after the search response is sent, so the endpoint waits for a write that is still in flight. It answers `404` (`unknown_search`) when no search event with that id exists.

## `GET /api/sources`

Returns `mode` (`live`, `demo`, or `unavailable`) and the configured source list with coverage, cadence, status, and successful-crawl timestamp.

## `GET /api/insights?period=`

`period` is `7d`, `30d` (default), or `90d`; any other value is a `400`. The window is that many whole UTC calendar days ending today.

Returns `periodDays`, `timezone` (`UTC`), `from`, `to`, total and unique queries, zero-result and click-through rates, average, p50, and p95 latency, top queries, zero-result queries, low-click queries, result clicks by source, and `daily`: one entry per day with `searches`, `zeroResultSearches`, `clickedSearches`, `p50LatencyMs`, and `p95LatencyMs`.

- Period percentiles are computed over every search event in the window, not by averaging daily percentiles.
- A day without searches is present with zero counts and `null` latencies.
- A click counts toward the day and period of the search it followed.
- `mode=unavailable` distinguishes a database outage from an empty period.

## `GET /api/status`

Returns mode (`live`, `degraded`, `demo`, or `unavailable`), independent database and search health, indexed counts, queue, failure, and duplicate metrics, source health, top domains, and generation time.

`searchEngine` reports `backend`, `healthy`, `indexRevision`, `numberOfDocuments`, and for the native backend its `state` (`starting`, `hydrating`, `ready`, `missing`, `error`) and `diagnostics`: hydration time, distinct terms, batches waiting to apply, the last index error, and memory use.
