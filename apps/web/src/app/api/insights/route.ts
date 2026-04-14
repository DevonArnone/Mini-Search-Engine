import { NextResponse } from "next/server";

import { withDb } from "@/lib/db";
import type { InsightsResponse } from "@mini-search/shared-types";

const DEMO_INSIGHTS: InsightsResponse = {
  totalSearches: 0,
  uniqueQueries: 0,
  zeroResultQueries: [],
  topQueries: [],
  lowClickQueries: [],
  topSources: [],
  avgLatencyMs: 0,
  period: "last 30 days",
};

export async function GET() {
  try {
    const insights = await withDb(async (client) => {
      // Aggregate over the last 30 days
      const [totalsResult, topQueriesResult, zeroResultResult, topSourcesResult] =
        await Promise.all([
          client.query<{
            total_searches: string;
            unique_queries: string;
            avg_latency_ms: string;
          }>(
            `SELECT
               COUNT(*)::text                            AS total_searches,
               COUNT(DISTINCT query)::text               AS unique_queries,
               COALESCE(AVG(latency_ms), 0)::text        AS avg_latency_ms
             FROM search_analytics
             WHERE created_at >= NOW() - INTERVAL '30 days'`,
          ),

          client.query<{
            query: string;
            cnt: string;
            avg_results: string;
            avg_latency_ms: string;
          }>(
            `SELECT
               query,
               COUNT(*)::text                            AS cnt,
               AVG(results_count)::text                  AS avg_results,
               AVG(latency_ms)::text                     AS avg_latency_ms
             FROM search_analytics
             WHERE created_at >= NOW() - INTERVAL '30 days'
               AND query <> ''
             GROUP BY query
             ORDER BY cnt DESC
             LIMIT 10`,
          ),

          client.query<{
            query: string;
            cnt: string;
            avg_results: string;
            avg_latency_ms: string;
          }>(
            `SELECT
               query,
               COUNT(*)::text                            AS cnt,
               AVG(results_count)::text                  AS avg_results,
               AVG(latency_ms)::text                     AS avg_latency_ms
             FROM search_analytics
             WHERE created_at >= NOW() - INTERVAL '30 days'
               AND results_count = 0
               AND query <> ''
             GROUP BY query
             ORDER BY cnt DESC
             LIMIT 10`,
          ),

          // Top sources by search result click-throughs or fallback to document count
          client.query<{ value: string; count: string }>(
            `SELECT
               d.source_slug   AS value,
               COUNT(sa.id)::text AS count
             FROM search_analytics sa
             JOIN documents d ON d.id = sa.clicked_document_id
             WHERE sa.created_at >= NOW() - INTERVAL '30 days'
               AND d.source_slug IS NOT NULL
             GROUP BY d.source_slug
             ORDER BY COUNT(sa.id) DESC
             LIMIT 10`,
          ),
        ]);

      const totals = totalsResult.rows[0];

      // Low-click queries: searched often but rarely result in a click
      const lowClickResult = await client.query<{
        query: string;
        cnt: string;
        avg_results: string;
        avg_latency_ms: string;
      }>(
        `SELECT
           sa.query,
           COUNT(sa.id)::text                                         AS cnt,
           AVG(sa.results_count)::text                                AS avg_results,
           AVG(sa.latency_ms)::text                                   AS avg_latency_ms
         FROM search_analytics sa
         WHERE sa.created_at >= NOW() - INTERVAL '30 days'
           AND sa.query <> ''
           AND sa.results_count > 0
         GROUP BY sa.query
         HAVING COUNT(sa.id) >= 3
            AND SUM(CASE WHEN sa.clicked_document_id IS NOT NULL THEN 1 ELSE 0 END)::float
                / COUNT(sa.id) < 0.2
         ORDER BY COUNT(sa.id) DESC
         LIMIT 10`,
      );

      const mapRows = (
        rows: Array<{ query: string; cnt: string; avg_results: string; avg_latency_ms: string }>,
      ) =>
        rows.map((row) => ({
          query: row.query,
          count: Number(row.cnt),
          avgResults: Math.round(Number(row.avg_results)),
          avgLatencyMs: Math.round(Number(row.avg_latency_ms)),
        }));

      return {
        totalSearches: Number(totals?.total_searches ?? 0),
        uniqueQueries: Number(totals?.unique_queries ?? 0),
        avgLatencyMs: Math.round(Number(totals?.avg_latency_ms ?? 0)),
        topQueries: mapRows(topQueriesResult.rows),
        zeroResultQueries: mapRows(zeroResultResult.rows),
        lowClickQueries: mapRows(lowClickResult.rows),
        topSources: topSourcesResult.rows.map((row) => ({
          value: row.value,
          count: Number(row.count),
        })),
        period: "last 30 days",
      } satisfies InsightsResponse;
    });

    return NextResponse.json(insights);
  } catch {
    return NextResponse.json(DEMO_INSIGHTS);
  }
}
