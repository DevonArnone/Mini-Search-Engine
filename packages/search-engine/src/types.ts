// ---------------------------------------------------------------------------
// Documents as published in index batches (snake_case mirrors the crawler and
// the PostgreSQL columns, so one record shape flows through the whole ETL).
// ---------------------------------------------------------------------------

export interface IndexDocument {
  id: string;
  url: string;
  canonical_url?: string | null;
  domain: string;
  source_slug: string | null;
  source_name: string | null;
  content_type: string | null;
  section_path: string | null;
  title: string | null;
  meta_description: string | null;
  headings: string[];
  body: string;
  language: string | null;
  published_at: string | null;
  last_updated_at: string | null;
  word_count?: number | null;
  code_block_count?: number | null;
  tags: string[];
  boost_score?: number | null;
  authority_score?: number | null;
  freshness_status?: string | null;
}

export type BatchOperation =
  | { op: "upsert"; doc: IndexDocument }
  | { op: "delete"; id: string };

// ---------------------------------------------------------------------------
// Shared index directory layout
// ---------------------------------------------------------------------------

export const INDEX_FORMAT_VERSION = 1;
export const MAX_BATCH_OPERATIONS = 250;

export interface ManifestBatch {
  seq: number;
  file: string;
  sha256: string;
  bytes: number;
  upserts: number;
  deletes: number;
  createdAt: string;
}

export interface Manifest {
  formatVersion: number;
  // Changes whenever the batch list is rewritten (rebuild or compaction).
  // Readers that see a new generation rehydrate from scratch.
  generation: string;
  // Incremented on every manifest write.
  revision: number;
  updatedAt: string;
  batches: ManifestBatch[];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchSort = "relevance" | "newest" | "oldest";

export interface SearchQuery {
  q: string;
  page: number;
  limit: number;
  source?: string[];
  contentType?: string[];
  domain?: string[];
  language?: string[];
  tags?: string[];
  sort?: SearchSort;
  // Inclusive UTC calendar dates (YYYY-MM-DD) applied to published_at.
  from?: string | null;
  to?: string | null;
  // "7d" | "30d" | "90d", applied to last_updated_at.
  updatedWithin?: string | null;
  // Injectable clock so updatedWithin is testable.
  now?: number;
}

// How the query terms were satisfied. "all": every term matched exactly.
// "corrected": unknown terms were replaced by bounded typo/prefix candidates.
// "any": no document held every term, so partial matches are ranked.
export type MatchMode = "all" | "corrected" | "any" | "browse";

export interface SearchHit {
  id: string;
  title: string;
  url: string;
  domain: string;
  sourceSlug: string | null;
  sourceName: string | null;
  contentType: string | null;
  sectionPath: string | null;
  snippet: string;
  highlights: string[];
  publishedAt: string | null;
  lastUpdatedAt: string | null;
  language: string | null;
  tags: string[];
  codeBlockCount: number;
  freshnessStatus: string;
  whyMatched: string[];
  score: number;
}

export interface SearchOutput {
  totalHits: number;
  matchMode: MatchMode;
  // Query term -> vocabulary terms it was recovered to (typo or prefix).
  corrections: Record<string, string[]>;
  hits: SearchHit[];
}

export interface FacetOption {
  value: string;
  count: number;
}

export interface FacetCounts {
  sources: FacetOption[];
  contentTypes: FacetOption[];
  domains: FacetOption[];
  languages: FacetOption[];
  tags: FacetOption[];
}

// ---------------------------------------------------------------------------
// Engine status
// ---------------------------------------------------------------------------

export type EngineState = "starting" | "hydrating" | "ready" | "missing" | "error";

export interface EngineStatus {
  state: EngineState;
  backend: "native";
  indexRevision: string | null;
  generation: string | null;
  appliedSeq: number;
  manifestRevision: number | null;
  documents: number;
  terms: number;
  deadPostingsDocs: number;
  hydrationMs: number | null;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingBatches: number;
  memory: { rssBytes: number; heapUsedBytes: number; externalBytes: number };
}
