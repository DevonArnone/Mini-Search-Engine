import type { EngineStatus, FacetCounts, SearchOutput, SearchQuery } from "./types";

export interface WorkerOptions {
  indexDir: string;
  pollMs: number;
}

export type WorkerRequest =
  | { id: number; type: "search"; query: SearchQuery }
  | { id: number; type: "autocomplete"; q: string }
  | { id: number; type: "facets" }
  | { id: number; type: "status" }
  | { id: number; type: "sync" };

export interface SearchReply extends SearchOutput {
  // Time spent inside the engine for this query, excluding queueing and transport.
  processingTimeMs: number;
  indexRevision: string | null;
}

export interface AutocompleteReply {
  suggestions: string[];
  processingTimeMs: number;
}

export type WorkerResult = SearchReply | AutocompleteReply | FacetCounts | EngineStatus;

export type WorkerResponse =
  | { id: number; ok: true; result: WorkerResult }
  | { id: number; ok: false; error: { code: "not_ready" | "failed"; message: string } };
