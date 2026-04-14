import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withDb } from "@/lib/db";
import { runSearch } from "@/lib/search";

const CONTENT_TYPES = ["guide", "reference", "tutorial", "api", "blog"] as const;
const UPDATED_WITHIN = ["7d", "30d", "90d"] as const;

const searchSchema = z.object({
  q: z.string().default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  // Source / classification filters
  source: z.array(z.string()).default([]),
  contentType: z.array(z.enum(CONTENT_TYPES)).default([]),
  // Legacy domain / language / tag filters
  domain: z.array(z.string()).default([]),
  language: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  // Sorting and date range
  sort: z.enum(["relevance", "newest", "oldest"]).default("relevance"),
  from: z.string().optional(),
  to: z.string().optional(),
  updatedWithin: z.enum(UPDATED_WITHIN).optional(),
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const payload = searchSchema.parse({
    q: params.get("q") ?? "",
    page: params.get("page") ?? "1",
    limit: params.get("limit") ?? "10",
    source: params.getAll("source"),
    contentType: params.getAll("contentType"),
    domain: params.getAll("domain"),
    language: params.getAll("language"),
    tags: params.getAll("tags"),
    sort: params.get("sort") ?? "relevance",
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    updatedWithin: params.get("updatedWithin") ?? undefined,
  });

  const startedAt = Date.now();
  const results = await runSearch(payload);
  const latency = Date.now() - startedAt;

  try {
    await withDb((client) =>
      client.query(
        `INSERT INTO search_analytics (query, filters, results_count, latency_ms)
         VALUES ($1, $2::jsonb, $3, $4)`,
        [
          payload.q,
          JSON.stringify({
            source: payload.source,
            contentType: payload.contentType,
            domain: payload.domain,
            language: payload.language,
            tags: payload.tags,
            sort: payload.sort,
            from: payload.from ?? null,
            to: payload.to ?? null,
            updatedWithin: payload.updatedWithin ?? null,
          }),
          results.totalHits,
          latency,
        ],
      ),
    );
  } catch {
    // Analytics must never block search responses.
  }

  return NextResponse.json(results);
}
