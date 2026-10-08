import { withDb } from "@/lib/db";
import { env } from "@/lib/env";

// Search events are written after the response has been sent, so a click can
// reach the server before its search row exists. Each in-flight write is
// registered here; the click handler waits for it instead of losing the link.
const globalStore = globalThis as typeof globalThis & { __devdocsPendingSearches?: Map<string, Promise<void>> };
const pendingSearches = (globalStore.__devdocsPendingSearches ??= new Map<string, Promise<void>>());

const CLICK_RETRY_DELAYS_MS = [150, 400];

export interface SearchEvent {
  searchId: string;
  sessionId: string;
  query: string;
  filters: Record<string, unknown>;
  resultsCount: number;
  latencyMs: number;
}

// Call before responding; run the returned function once the response is out.
export function deferSearchEvent(event: SearchEvent): () => Promise<void> {
  let settle: () => void = () => {};
  pendingSearches.set(event.searchId, new Promise<void>((resolve) => (settle = resolve)));
  return async () => {
    try {
      await withDb((client) =>
        client.query(
          `INSERT INTO search_analytics
             (search_id, event_type, session_id, query, filters, results_count, latency_ms)
           VALUES ($1, 'search', $2, $3, $4::jsonb, $5, $6)`,
          [event.searchId, event.sessionId, event.query, JSON.stringify(event.filters), event.resultsCount, event.latencyMs],
        ),
      );
    } catch {
      // Analytics never fails a search; the event is dropped.
    } finally {
      pendingSearches.delete(event.searchId);
      settle();
    }
  };
}

function insertClick(searchId: string, sessionId: string | null, documentId: string, rank: number) {
  return withDb(async (client) => {
    const result = await client.query(
      `INSERT INTO search_analytics
         (search_id, event_type, session_id, query, filters, results_count, latency_ms, clicked_document_id, result_rank)
       SELECT $1, 'result_click', $2, query, filters, results_count, latency_ms, $3, $4
       FROM search_analytics
       WHERE search_id = $1 AND event_type = 'search'
       LIMIT 1`,
      [searchId, sessionId, documentId, rank],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

// Returns false when no search event with this id exists.
export async function recordClick(searchId: string, sessionId: string | null, documentId: string, rank: number): Promise<boolean> {
  const pending = pendingSearches.get(searchId);
  if (pending) {
    await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, env.databaseTimeoutMs))]);
  }
  if (await insertClick(searchId, sessionId, documentId, rank)) return true;
  // The search may have been served by another process that is still writing.
  for (const delay of CLICK_RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (await insertClick(searchId, sessionId, documentId, rank)) return true;
  }
  return false;
}
