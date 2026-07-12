import type { ContentType } from "@mini-search/shared-types";

import type { SearchState } from "@/types/search";

const CONTENT_TYPES = new Set<ContentType>(["guide", "reference", "tutorial", "api", "blog"]);
const SORTS = new Set<SearchState["sort"]>(["relevance", "newest", "oldest"]);
const UPDATED_WITHIN = new Set(["7d", "30d", "90d"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function uniqueValues(input: URLSearchParams, key: string) {
  return Array.from(new Set(input.getAll(key).map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

function parseDate(value: string | null) {
  return value && ISO_DATE.test(value) ? value : null;
}

export function parseSearchState(input: URLSearchParams): SearchState {
  const sort = input.get("sort") as SearchState["sort"] | null;
  const updatedWithin = input.get("updatedWithin");

  return {
    q: (input.get("q") ?? "").trim().slice(0, 200),
    page: parseInteger(input.get("page"), 1, 1, 10_000),
    limit: parseInteger(input.get("limit"), 10, 1, 50),
    source: uniqueValues(input, "source"),
    contentType: uniqueValues(input, "contentType").filter((value): value is ContentType => CONTENT_TYPES.has(value as ContentType)),
    domain: uniqueValues(input, "domain"),
    language: uniqueValues(input, "language"),
    tags: uniqueValues(input, "tags"),
    sort: sort && SORTS.has(sort) ? sort : "relevance",
    from: parseDate(input.get("from")),
    to: parseDate(input.get("to")),
    updatedWithin: updatedWithin && UPDATED_WITHIN.has(updatedWithin) ? updatedWithin : null,
  };
}

export function toSearchParams(state: SearchState) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.limit !== 10) params.set("limit", String(state.limit));
  if (state.sort !== "relevance") params.set("sort", state.sort);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.updatedWithin) params.set("updatedWithin", state.updatedWithin);
  for (const value of state.source) params.append("source", value);
  for (const value of state.contentType) params.append("contentType", value);
  for (const value of state.domain) params.append("domain", value);
  for (const value of state.language) params.append("language", value);
  for (const value of state.tags) params.append("tags", value);
  return params;
}
