import type { SearchState } from "@/types/search";

export function parseSearchState(input: URLSearchParams): SearchState {
  return {
    q: input.get("q") ?? "",
    page: Number(input.get("page") ?? "1"),
    limit: Number(input.get("limit") ?? "10"),
    domain: input.getAll("domain"),
    language: input.getAll("language"),
    tags: input.getAll("tags"),
    sort: (input.get("sort") as SearchState["sort"]) ?? "relevance",
    from: input.get("from"),
    to: input.get("to"),
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
  for (const value of state.domain) params.append("domain", value);
  for (const value of state.language) params.append("language", value);
  for (const value of state.tags) params.append("tags", value);
  return params;
}
