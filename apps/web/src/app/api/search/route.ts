import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { apiError, ServiceUnavailableError, validationError } from "@/lib/api";
import { searchSchema } from "@/lib/api-schemas";
import { withDb } from "@/lib/db";
import { runSearch } from "@/lib/search";

const SESSION_COOKIE = "devdocs_session";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = searchSchema.safeParse({
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

  if (!parsed.success) return validationError(parsed.error);

  const payload = parsed.data;
  const startedAt = Date.now();

  try {
    const results = await runSearch(payload);
    const latency = Date.now() - startedAt;
    let searchId: string | undefined;
    const existingSessionId = request.cookies.get(SESSION_COOKIE)?.value;
    const sessionId = existingSessionId ?? randomUUID();

    if (payload.q && results.mode === "live") {
      searchId = randomUUID();
      try {
        await withDb((client) =>
          client.query(
            `INSERT INTO search_analytics
               (search_id, event_type, session_id, query, filters, results_count, latency_ms)
             VALUES ($1, 'search', $2, $3, $4::jsonb, $5, $6)`,
            [
              searchId,
              sessionId,
              payload.q.toLowerCase(),
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
        searchId = undefined;
      }
    }

    const response = NextResponse.json({ ...results, ...(searchId ? { searchId } : {}) });
    if (!existingSessionId) {
      response.cookies.set(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return apiError("search_unavailable", "Search is temporarily unavailable. Please try again.", 503);
    }
    return apiError("search_failed", "The search request could not be completed.", 500);
  }
}
