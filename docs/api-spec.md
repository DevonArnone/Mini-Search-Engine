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

The response contains query/page metadata, `totalHits`, processing time, mode, recovery suggestions, and result records. A non-empty live query may include `searchId` for click attribution.

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

The server copies query/filter/result metadata from the linked `search` event and associates the random HTTP-only session cookie when available.

## `GET /api/sources`

Returns `mode` (`live`, `demo`, or `unavailable`) and the configured source list with coverage, cadence, status, and successful-crawl timestamp.

## `GET /api/insights`

Returns a 30-day analytics window with total/unique queries, zero-result and click-through rates, average/p50/p95 latency, top queries, zero-result queries, low-click queries, and most-clicked sources. `mode=unavailable` distinguishes a database outage from an empty period.

## `GET /api/status`

Returns mode (`live`, `degraded`, `demo`, or `unavailable`), independent database/search health, indexed counts, queue/failure/duplicate metrics, source health, top domains, and generation time.
