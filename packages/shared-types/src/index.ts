export type SearchSort = "relevance" | "newest" | "oldest";

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  highlights: string[];
  publishedAt: string | null;
  language: string | null;
  tags: string[];
}

export interface SearchResponse {
  query: string;
  page: number;
  limit: number;
  totalHits: number;
  processingTimeMs: number;
  results: SearchResult[];
}
