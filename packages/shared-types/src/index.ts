export type SearchSort = "relevance" | "newest" | "oldest";

export type ContentType = "guide" | "reference" | "tutorial" | "api" | "blog";

export type FreshnessStatus = "fresh" | "ok" | "stale" | "failing" | "unknown";

export type CrawlStatus = "pending" | "crawling" | "healthy" | "failing";

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
}

export interface SearchResponse {
  query: string;
  page: number;
  limit: number;
  totalHits: number;
  processingTimeMs: number;
  mode: "live" | "demo";
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

export interface InsightsResponse {
  totalSearches: number;
  uniqueQueries: number;
  zeroResultQueries: InsightQuery[];
  topQueries: InsightQuery[];
  lowClickQueries: InsightQuery[];
  topSources: FilterOption[];
  avgLatencyMs: number;
  period: string;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface StatusDomainCount {
  value: string;
  count: number;
}

export interface StatusResponse {
  mode: "live" | "demo";
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
    indexUid: string;
    numberOfDocuments?: number;
  };
  database: {
    healthy: boolean;
  };
  generatedAt: string;
}
