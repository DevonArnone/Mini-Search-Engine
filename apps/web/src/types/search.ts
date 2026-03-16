import type { SearchResponse, SearchSort } from "@mini-search/shared-types";

export interface FilterOption {
  value: string;
  count: number;
}

export interface FiltersResponse {
  domains: FilterOption[];
  languages: FilterOption[];
  tags: FilterOption[];
  dateBuckets: FilterOption[];
}

export interface SearchState {
  q: string;
  page: number;
  limit: number;
  domain: string[];
  language: string[];
  tags: string[];
  sort: SearchSort;
}

export type { SearchResponse, SearchSort };

