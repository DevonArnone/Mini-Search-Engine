export type SearchSort = "relevance" | "newest" | "oldest";

export type ContentType = "guide" | "reference" | "tutorial" | "api" | "blog";

export type FreshnessStatus = "fresh" | "ok" | "stale" | "failing" | "unknown";

export type CrawlStatus = "pending" | "crawling" | "healthy" | "failing";

// Which retrieval engine answered. "native" is the in-process inverted index;
// "meilisearch" is kept selectable for comparison; "demo" is bundled sample data.
export type SearchBackend = "native" | "meilisearch" | "demo";

// ---------------------------------------------------------------------------
// Search result
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  highlights: string[];
  publishedAt: string | null;
  lastUpdatedAt: string | null;
  language: string | null;
  tags: string[];
  // Source provenance
  sourceSlug: string | null;
  sourceName: string | null;
  // Classification & quality
  contentType: ContentType | null;
  sectionPath: string | null;
  codeBlockCount: number;
  freshnessStatus: FreshnessStatus;
  // Explainability
  whyMatched: string[];  // e.g. ["title", "headings", "body"]
  // BM25 relevance score, for inspection. Only the native backend reports it.
  score?: number;
}

export interface SearchResponse {
  searchId?: string;
  query: string;
  page: number;
  limit: number;
  totalHits: number;
  processingTimeMs: number;
  mode: "live" | "demo";
  backend: SearchBackend;
  // Identifies the exact index state that produced these results; null when
  // the backend does not version its index.
  indexRevision: string | null;
  warning?: string;
  results: SearchResult[];
  // Recovery suggestions when results are sparse
  recoverySuggestions?: string[];
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string;
  count: number;
}

export interface FiltersResponse {
  sources: FilterOption[];
  contentTypes: FilterOption[];
  domains: FilterOption[];
  languages: FilterOption[];
  tags: FilterOption[];
  dateBuckets: FilterOption[];
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SourceInfo {
  slug: string;
  name: string;
  description: string;
  homeUrl: string;
  authorityWeight: number;
  crawlCadenceHours: number;
  lastCrawledAt: string | null;
  docCount: number;
  crawlStatus: CrawlStatus;
}

export interface SourcesResponse {
  mode: "live" | "demo" | "unavailable";
  sources: SourceInfo[];
}

// ---------------------------------------------------------------------------
// Insights / analytics
// ---------------------------------------------------------------------------

export interface InsightQuery {
  query: string;
  count: number;
  avgResults: number;
  avgLatencyMs: number;
}

export type InsightsPeriodDays = 7 | 30 | 90;

// One UTC calendar day. A day with no searches has zero counts and null
// latencies; it is still present, so charts show the gap.
export interface InsightsDay {
  date: string; // YYYY-MM-DD (UTC)
  searches: number;
  zeroResultSearches: number;
  clickedSearches: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface InsightsResponse {
  mode: "live" | "unavailable";
  // Reporting window: the last `periodDays` UTC calendar days, today included.
  periodDays: InsightsPeriodDays;
  timezone: "UTC";
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  period: string;
  totalSearches: number;
  uniqueQueries: number;
  zeroResultQueries: InsightQuery[];
  topQueries: InsightQuery[];
  lowClickQueries: InsightQuery[];
  // Result clicks by source, attributed to the day of the search they followed.
  topSources: FilterOption[];
  avgLatencyMs: number;
  // Percentiles over every search event in the window, not an average of daily values.
  p50LatencyMs: number;
  p95LatencyMs: number;
  zeroResultRate: number;
  clickThroughRate: number;
  daily: InsightsDay[];
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface StatusDomainCount {
  value: string;
  count: number;
}

export interface StatusResponse {
  mode: "live" | "degraded" | "demo" | "unavailable";
  indexedDocuments: number;
  queuedDocuments: number;
  crawlFailures: number;
  analyticsEvents: number;
  duplicateDocuments: number;
  duplicateGroups: number;
  topDomains: StatusDomainCount[];
  sources: SourceInfo[];
  searchEngine: {
    healthy: boolean;
    backend: SearchBackend;
    indexUid: string;
    indexRevision: string | null;
    // Native backend only: "ready", "hydrating", "missing", ...
    state?: string;
    numberOfDocuments?: number;
    // Native backend only: how the in-memory index was built and what it costs.
    diagnostics?: {
      hydrationMs: number | null;
      terms: number;
      pendingBatches: number;
      lastError: string | null;
      rssBytes: number;
      heapUsedBytes: number;
      externalBytes: number;
    };
  };
  database: {
    healthy: boolean;
  };
  generatedAt: string;
}
