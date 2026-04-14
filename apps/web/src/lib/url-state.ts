import type { ContentType } from "@mini-search/shared-types";

import type { SearchState } from "@/types/search";

const CONTENT_TYPES = new Set<ContentType>(["guide", "reference", "tutorial", "api", "blog"]);

function isContentType(value: string): value is ContentType {
  return CONTENT_TYPES.has(value as ContentType);
}

export function parseSearchState(input: URLSearchParams): SearchState {
  return {
    q: input.get("q") ?? "",
    page: Number(input.get("page") ?? "1"),
    limit: Number(input.get("limit") ?? "10"),
    source: input.getAll("source"),
    contentType: input.getAll("contentType").filter(isContentType),
    domain: input.getAll("domain"),
    language: input.getAll("language"),
    tags: input.getAll("tags"),
    sort: (input.get("sort") as SearchState["sort"]) ?? "relevance",
    from: input.get("from"),
    to: input.get("to"),
    updatedWithin: input.get("updatedWithin"),
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
