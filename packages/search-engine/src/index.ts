// Entry point for the web application: the worker client and shared types.
// Engine internals are imported from their own modules.
export { EngineClient, EngineUnavailableError, type EngineClientOptions } from "./client";
export type { AutocompleteReply, SearchReply } from "./protocol";
export type {
  EngineState,
  EngineStatus,
  FacetCounts,
  FacetOption,
  IndexDocument,
  MatchMode,
  SearchHit,
  SearchOutput,
  SearchQuery,
} from "./types";
