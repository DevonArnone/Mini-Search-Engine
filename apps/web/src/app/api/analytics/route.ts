import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withDb } from "@/lib/db";

const analyticsSchema = z.object({
  query: z.string(),
  filters: z.record(z.any()).default({}),
  resultsCount: z.number().int().min(0).default(0),
  latencyMs: z.number().int().min(0).default(0),
  clickedDocumentId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const payload = analyticsSchema.parse(await request.json());
  await withDb((client) =>
    client.query(
      `INSERT INTO search_analytics (query, filters, results_count, latency_ms, clicked_document_id)
       VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [
        payload.query,
        JSON.stringify(payload.filters),
        payload.resultsCount,
        payload.latencyMs,
        payload.clickedDocumentId ?? null,
      ],
    ),
  );

  return NextResponse.json({ ok: true });
}

