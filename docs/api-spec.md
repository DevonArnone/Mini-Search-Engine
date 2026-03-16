# API Spec

## GET /api/search

Query params:

- `q`
- `page`
- `limit`
- `domain`
- `language`
- `tags`
- `sort`
- `from`
- `to`

Response fields:

- `query`
- `page`
- `limit`
- `totalHits`
- `processingTimeMs`
- `results`

## GET /api/autocomplete

Returns string suggestions and top title matches for a prefix query.

## GET /api/filters

Returns facet distributions for domains, languages, tags, and lightweight date buckets.

## POST /api/analytics

Accepts search query analytics and optional click-through metadata for later ranking analysis.

