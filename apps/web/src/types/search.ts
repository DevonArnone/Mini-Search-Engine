import type {
  ContentType,
  FiltersResponse,
  SearchResult,
  SearchResponse,
  SearchSort,
} from "@mini-search/shared-types";

export interface SearchState {
  q: string;
  page: number;
  limit: number;
  source: string[];
  contentType: ContentType[];
  domain: string[];
  language: string[];
  tags: string[];
  sort: SearchSort;
  from: string | null;
  to: string | null;
  updatedWithin: string | null; // "7d" | "30d" | "90d" | null
}

export type { ContentType, FiltersResponse, SearchResponse, SearchResult, SearchSort };
