import { NextRequest, NextResponse } from "next/server";

import { apiError, validationError } from "@/lib/api";
import { clickEventSchema } from "@/lib/api-schemas";
import { withDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json", "The request body must be valid JSON.", 400);
  }

  const parsed = clickEventSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const sessionId = request.cookies.get("devdocs_session")?.value ?? null;
    await withDb((client) =>
      client.query(
        `INSERT INTO search_analytics
           (search_id, event_type, session_id, query, filters, results_count, latency_ms, clicked_document_id, result_rank)
         SELECT $1, 'result_click', $2, query, filters, results_count, latency_ms, $3, $4
         FROM search_analytics
         WHERE search_id = $1 AND event_type = 'search'
         LIMIT 1`,
        [parsed.data.searchId, sessionId, parsed.data.clickedDocumentId, parsed.data.resultRank],
      ),
    );
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("analytics_unavailable", "The analytics event could not be recorded.", 503);
  }
}
