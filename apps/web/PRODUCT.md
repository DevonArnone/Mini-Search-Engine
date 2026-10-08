# Product

## Platform

web

## Users

Primary: working developers looking something up in official documentation (MDN Web Docs, React, Next.js, TypeScript, PostgreSQL) mid-task. They arrive with a term or a half-remembered API name and want the right official page fast, with enough context to trust the result before clicking.

Secondary: engineers and recruiters evaluating the project. They inspect how retrieval works: where each result came from, why it matched, how fresh the index is, and what the engine measurably does.

## Product Purpose

One search box over five official documentation sources. Success is a developer reaching the correct official page from the first results screen, and a reviewer being able to verify every number the interface shows.

## Positioning

Retrieval is the project's own work: a custom inverted index with field-weighted BM25, fed by its own crawler, with PostgreSQL as the source of truth. Only official sources are indexed, and every result carries its provenance.

## Operating Context

- Search is submitted explicitly; autocomplete suggests document titles while typing.
- Search state lives in the URL (query, filters, sort, page) and survives back/forward navigation and sharing.
- Source workspaces lock the search to one source.
- Insights report real query volume, latency, zero-result and click-through rates over 7, 30, or 90 days, in UTC daily buckets.
- Runs on a persistent Node server with a shared index volume; Meilisearch remains selectable for comparison.

## Capabilities and Constraints

- Filters: source, content type, domain, language, tags, publication date range, updated-within. Sorting: relevance, newest, oldest.
- Each result exposes title, URL, section path, snippet with highlighted matches, fields matched, freshness, code-example count, and relevance score.
- The response supplies a code-example count, not code bodies; there is no embedded code viewer.
- Click tracking fires only when a result document is opened.
- Stack is fixed: Next.js App Router, React, TypeScript, Tailwind CSS, Lucide; Motion, Radix primitives, next-themes, and Recharts are approved additions.

## Brand Commitments

- Name: DevDocs Search.
- Fonts (binding, self-hosted): Fraunces for display headings, Public Sans for controls and reading, JetBrains Mono for code and measurements.
- Identity (binding): a digital reference library — oversized editorial typography, warm paper surfaces, deep ink, precise per-source accents, and an equally considered dark theme. The home page is dramatic; the search workspace is easy to scan.
- Each of the five sources keeps a recognizable identity across themes.

## Evidence on Hand

- Live counts, crawl health, and engine state from `/api/status` and `/api/sources`.
- Real analytics from `/api/insights`.
- Measured benchmark and corpus reports under `docs/evidence/`.
- There are no testimonials, customers, or usage claims; none may be invented.
- A statistic that is missing or not yet measured is omitted from the interface. A service that is down is shown as unavailable, never as a healthy zero.

## Product Principles

1. Every number on screen is real and traceable to a service or a recorded measurement.
2. Provenance before persuasion: show where a result came from and why it matched.
3. Search is always one keystroke away and never waits on decoration.
4. Failure states are designed surfaces, not afterthoughts.

## Accessibility & Inclusion

WCAG 2.2 AA. Full keyboard operation, visible focus, focus-managed dialogs, reduced-motion support, and status never conveyed by color alone.
