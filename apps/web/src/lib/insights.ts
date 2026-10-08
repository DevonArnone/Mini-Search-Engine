import type { InsightsDay, InsightsPeriodDays, InsightsResponse } from "@mini-search/shared-types";

import { withDb } from "@/lib/db";

export const INSIGHTS_PERIODS: readonly InsightsPeriodDays[] = [7, 30, 90];
export const DEFAULT_INSIGHTS_PERIOD: InsightsPeriodDays = 30;

// Accepts "7", "30", "90" (optionally suffixed with "d"). Anything else is
// rejected rather than coerced, so a typo cannot silently change the report.
export function parseInsightsPeriod(value: string | string[] | null | undefined): InsightsPeriodDays | null {
  if (value === null || value === undefined) return DEFAULT_INSIGHTS_PERIOD;
  if (Array.isArray(value)) return null;
  const match = /^(7|30|90)d?$/.exec(value.trim());
  return match ? (Number(match[1]) as InsightsPeriodDays) : null;
}

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// The window is whole UTC calendar days: [today - (days - 1), today].
export function reportingWindow(periodDays: InsightsPeriodDays, now: Date = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: periodDays }, (_, index) => isoDay(new Date(today - (periodDays - 1 - index) * DAY_MS)));
  return { from: days[0], to: days[days.length - 1], days };
}

export interface DailyRow {
  day: string;
  searches: number;
  zeroResultSearches: number;
  clickedSearches: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

// Every day of the window appears once, in order. Days the database returned
// nothing for are explicit zero-search buckets with no latency.
export function fillDailyBuckets(days: string[], rows: DailyRow[]): InsightsDay[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return days.map((date) => {
    const row = byDay.get(date);
    return {
      date,
      searches: row?.searches ?? 0,
      zeroResultSearches: row?.zeroResultSearches ?? 0,
      clickedSearches: row?.clickedSearches ?? 0,
      p50LatencyMs: row && row.searches > 0 ? row.p50LatencyMs : null,
      p95LatencyMs: row && row.searches > 0 ? row.p95LatencyMs : null,
    };
  });
}

function emptyInsights(periodDays: InsightsPeriodDays, now: Date): InsightsResponse {
  const window = reportingWindow(periodDays, now);
  return {
    mode: "unavailable",
    periodDays,
    timezone: "UTC",
    from: window.from,
    to: window.to,
    period: `last ${periodDays} days`,
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
    daily: [],
  };
}

type QueryRow = { query: string; cnt: string; avg_results: string; avg_latency_ms: string };

function mapRows(rows: QueryRow[]) {
  return rows.map((row) => ({
    query: row.query,
    count: Number(row.cnt),
    avgResults: Math.round(Number(row.avg_results)),
    avgLatencyMs: Math.round(Number(row.avg_latency_ms)),
  }));
}

// search_analytics.created_at is a UTC timestamp without time zone, so day
// boundaries below are UTC. A click belongs to the day and period of the
// search it followed (joined on search_id), not to the moment of the click;
// the click-through rate, the daily series, and the source comparison all use
// that one rule.
const SEARCHES_CTE = `
  searches AS (
    SELECT * FROM search_analytics
    WHERE event_type = 'search' AND created_at >= $1::date AND created_at < ($2::date + 1)
  ),
  clicked AS (
    SELECT DISTINCT c.search_id
    FROM search_analytics c
    JOIN searches s ON s.search_id = c.search_id
    WHERE c.event_type = 'result_click'
  )`;

export async function getInsights(periodDays: InsightsPeriodDays = DEFAULT_INSIGHTS_PERIOD, now: Date = new Date()): Promise<InsightsResponse> {
  const window = reportingWindow(periodDays, now);
  const range = [window.from, window.to];
  try {
    return await withDb(async (client) => {
      const totalsResult = await client.query<{
        total_searches: string;
        unique_queries: string;
        avg_latency_ms: string;
        p50_latency_ms: string;
        p95_latency_ms: string;
        zero_result_searches: string;
        clicked_searches: string;
      }>(
        `WITH ${SEARCHES_CTE}
         SELECT COUNT(*)::text AS total_searches,
                COUNT(DISTINCT NULLIF(query, ''))::text AS unique_queries,
                COALESCE(AVG(latency_ms), 0)::text AS avg_latency_ms,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::text AS p50_latency_ms,
                COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::text AS p95_latency_ms,
                COUNT(*) FILTER (WHERE results_count = 0)::text AS zero_result_searches,
                COUNT(clicked.search_id)::text AS clicked_searches
         FROM searches LEFT JOIN clicked USING (search_id)`,
        range,
      );
      const dailyResult = await client.query<{
        day: string;
        searches: string;
        zero_result_searches: string;
        clicked_searches: string;
        p50_latency_ms: string | null;
        p95_latency_ms: string | null;
      }>(
        `WITH ${SEARCHES_CTE}
         SELECT to_char(date_trunc('day', searches.created_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::text AS searches,
                COUNT(*) FILTER (WHERE results_count = 0)::text AS zero_result_searches,
                COUNT(clicked.search_id)::text AS clicked_searches,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::text AS p50_latency_ms,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::text AS p95_latency_ms
         FROM searches LEFT JOIN clicked USING (search_id)
         GROUP BY 1 ORDER BY 1`,
        range,
      );
      const topQueriesResult = await client.query<QueryRow>(
        `WITH ${SEARCHES_CTE}
         SELECT query, COUNT(*)::text AS cnt, AVG(results_count)::text AS avg_results, AVG(latency_ms)::text AS avg_latency_ms
         FROM searches WHERE query <> ''
         GROUP BY query ORDER BY COUNT(*) DESC, query ASC LIMIT 10`,
        range,
      );
      const zeroResultResult = await client.query<QueryRow>(
        `WITH ${SEARCHES_CTE}
         SELECT query, COUNT(*)::text AS cnt, AVG(results_count)::text AS avg_results, AVG(latency_ms)::text AS avg_latency_ms
         FROM searches WHERE results_count = 0 AND query <> ''
         GROUP BY query ORDER BY COUNT(*) DESC, query ASC LIMIT 10`,
        range,
      );
      const lowClickResult = await client.query<QueryRow>(
        `WITH ${SEARCHES_CTE}
         SELECT searches.query, COUNT(*)::text AS cnt,
                AVG(searches.results_count)::text AS avg_results,
                AVG(searches.latency_ms)::text AS avg_latency_ms
         FROM searches LEFT JOIN clicked USING (search_id)
         WHERE searches.query <> '' AND searches.results_count > 0
         GROUP BY searches.query
         HAVING COUNT(*) >= 3 AND AVG(CASE WHEN clicked.search_id IS NULL THEN 0 ELSE 1 END) < 0.2
         ORDER BY COUNT(*) DESC, searches.query ASC LIMIT 10`,
        range,
      );
      const topSourcesResult = await client.query<{ value: string; count: string }>(
        `WITH ${SEARCHES_CTE}
         SELECT documents.source_slug AS value, COUNT(*)::text AS count
         FROM search_analytics click
         JOIN searches ON searches.search_id = click.search_id
         JOIN documents ON documents.id = click.clicked_document_id
         WHERE click.event_type = 'result_click' AND documents.source_slug IS NOT NULL
         GROUP BY documents.source_slug ORDER BY COUNT(*) DESC, documents.source_slug ASC LIMIT 10`,
        range,
      );

      const totals = totalsResult.rows[0];
      const totalSearches = Number(totals?.total_searches ?? 0);
      const zeroResultSearches = Number(totals?.zero_result_searches ?? 0);
      const clickedSearches = Number(totals?.clicked_searches ?? 0);
      const round = (value: string | null) => (value === null ? null : Math.round(Number(value)));

      return {
        mode: "live",
        periodDays,
        timezone: "UTC",
        from: window.from,
        to: window.to,
        period: `last ${periodDays} days`,
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
        daily: fillDailyBuckets(
          window.days,
          dailyResult.rows.map((row) => ({
            day: row.day,
            searches: Number(row.searches),
            zeroResultSearches: Number(row.zero_result_searches),
            clickedSearches: Number(row.clicked_searches),
            p50LatencyMs: round(row.p50_latency_ms),
            p95LatencyMs: round(row.p95_latency_ms),
          })),
        ),
      };
    });
  } catch {
    return emptyInsights(periodDays, now);
  }
}
