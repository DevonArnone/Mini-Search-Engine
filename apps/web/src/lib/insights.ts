import type { InsightsResponse } from "@mini-search/shared-types";

import { withDb } from "@/lib/db";

const EMPTY_INSIGHTS: InsightsResponse = {
  mode: "unavailable",
  totalSearches: 0,
  uniqueQueries: 0,
  zeroResultQueries: [],
  topQueries: [],
  lowClickQueries: [],
  topSources: [],
  avgLatencyMs: 0,
  p50LatencyMs: 0,
  p95LatencyMs: 0,
  zeroResultRate: 0,
  clickThroughRate: 0,
  period: "last 30 days",
};

type QueryRow = { query: string; cnt: string; avg_results: string; avg_latency_ms: string };

function mapRows(rows: QueryRow[]) {
  return rows.map((row) => ({
    query: row.query,
    count: Number(row.cnt),
    avgResults: Math.round(Number(row.avg_results)),
    avgLatencyMs: Math.round(Number(row.avg_latency_ms)),
  }));
}

export async function getInsights(): Promise<InsightsResponse> {
  try {
    return await withDb(async (client) => {
      const [totalsResult, topQueriesResult, zeroResultResult, lowClickResult, topSourcesResult] = await Promise.all([
        client.query<{
          total_searches: string;
          unique_queries: string;
          avg_latency_ms: string;
          p50_latency_ms: string;
          p95_latency_ms: string;
          zero_result_searches: string;
          clicked_searches: string;
        }>(
          `WITH searches AS (
             SELECT * FROM search_analytics
             WHERE event_type = 'search' AND created_at >= NOW() - INTERVAL '30 days'
           ), clicked AS (
             SELECT DISTINCT search_id FROM search_analytics
             WHERE event_type = 'result_click' AND created_at >= NOW() - INTERVAL '30 days'
           )
           SELECT COUNT(*)::text AS total_searches,
                  COUNT(DISTINCT NULLIF(query, ''))::text AS unique_queries,
                  COALESCE(AVG(latency_ms), 0)::text AS avg_latency_ms,
                  COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::text AS p50_latency_ms,
                  COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::text AS p95_latency_ms,
                  COUNT(*) FILTER (WHERE results_count = 0)::text AS zero_result_searches,
                  COUNT(clicked.search_id)::text AS clicked_searches
           FROM searches LEFT JOIN clicked USING (search_id)`,
        ),
        client.query<QueryRow>(
          `SELECT query, COUNT(*)::text AS cnt, AVG(results_count)::text AS avg_results,
                  AVG(latency_ms)::text AS avg_latency_ms
           FROM search_analytics
           WHERE event_type = 'search' AND created_at >= NOW() - INTERVAL '30 days' AND query <> ''
           GROUP BY query ORDER BY COUNT(*) DESC, query ASC LIMIT 10`,
        ),
        client.query<QueryRow>(
          `SELECT query, COUNT(*)::text AS cnt, AVG(results_count)::text AS avg_results,
                  AVG(latency_ms)::text AS avg_latency_ms
           FROM search_analytics
           WHERE event_type = 'search' AND created_at >= NOW() - INTERVAL '30 days'
             AND results_count = 0 AND query <> ''
           GROUP BY query ORDER BY COUNT(*) DESC, query ASC LIMIT 10`,
        ),
        client.query<QueryRow>(
          `WITH searches AS (
             SELECT * FROM search_analytics
             WHERE event_type = 'search' AND created_at >= NOW() - INTERVAL '30 days'
               AND query <> '' AND results_count > 0
           ), clicked AS (
             SELECT DISTINCT search_id FROM search_analytics
             WHERE event_type = 'result_click' AND created_at >= NOW() - INTERVAL '30 days'
           )
           SELECT searches.query, COUNT(*)::text AS cnt,
                  AVG(searches.results_count)::text AS avg_results,
                  AVG(searches.latency_ms)::text AS avg_latency_ms
           FROM searches LEFT JOIN clicked USING (search_id)
           GROUP BY searches.query
           HAVING COUNT(*) >= 3 AND AVG(CASE WHEN clicked.search_id IS NULL THEN 0 ELSE 1 END) < 0.2
           ORDER BY COUNT(*) DESC, searches.query ASC LIMIT 10`,
        ),
        client.query<{ value: string; count: string }>(
          `SELECT documents.source_slug AS value, COUNT(*)::text AS count
           FROM search_analytics
           JOIN documents ON documents.id = search_analytics.clicked_document_id
           WHERE search_analytics.event_type = 'result_click'
             AND search_analytics.created_at >= NOW() - INTERVAL '30 days'
             AND documents.source_slug IS NOT NULL
           GROUP BY documents.source_slug ORDER BY COUNT(*) DESC LIMIT 10`,
        ),
      ]);

      const totals = totalsResult.rows[0];
      const totalSearches = Number(totals?.total_searches ?? 0);
      const zeroResultSearches = Number(totals?.zero_result_searches ?? 0);
      const clickedSearches = Number(totals?.clicked_searches ?? 0);

      return {
        mode: "live",
        totalSearches,
        uniqueQueries: Number(totals?.unique_queries ?? 0),
        avgLatencyMs: Math.round(Number(totals?.avg_latency_ms ?? 0)),
        p50LatencyMs: Math.round(Number(totals?.p50_latency_ms ?? 0)),
        p95LatencyMs: Math.round(Number(totals?.p95_latency_ms ?? 0)),
        zeroResultRate: totalSearches ? Math.round((zeroResultSearches / totalSearches) * 1000) / 10 : 0,
        clickThroughRate: totalSearches ? Math.round((clickedSearches / totalSearches) * 1000) / 10 : 0,
        topQueries: mapRows(topQueriesResult.rows),
        zeroResultQueries: mapRows(zeroResultResult.rows),
        lowClickQueries: mapRows(lowClickResult.rows),
        topSources: topSourcesResult.rows.map((row) => ({ value: row.value, count: Number(row.count) })),
        period: "last 30 days",
      };
    });
  } catch {
    return EMPTY_INSIGHTS;
  }
}
