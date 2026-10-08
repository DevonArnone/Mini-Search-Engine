import { fillDailyBuckets, getInsights, parseInsightsPeriod, reportingWindow } from "@/lib/insights";

const query = vi.fn();
vi.mock("@/lib/db", () => ({
  withDb: vi.fn(async (handler: (client: { query: typeof query }) => Promise<unknown>) => handler({ query })),
}));

describe("insights reporting period", () => {
  it("accepts only 7, 30, and 90 days", () => {
    expect(parseInsightsPeriod(null)).toBe(30);
    expect(parseInsightsPeriod(undefined)).toBe(30);
    expect(parseInsightsPeriod("7d")).toBe(7);
    expect(parseInsightsPeriod("30")).toBe(30);
    expect(parseInsightsPeriod(" 90d ")).toBe(90);
    for (const invalid of ["", "14d", "365d", "7days", "-7", "7d; DROP TABLE", "abc", ["7d", "30d"]]) {
      expect(parseInsightsPeriod(invalid)).toBeNull();
    }
  });

  it("covers whole UTC calendar days ending today", () => {
    // 23:30 in New York on the 6th is already the 7th in UTC.
    const window = reportingWindow(7, new Date("2026-10-07T03:30:00Z"));
    expect(window.from).toBe("2026-10-01");
    expect(window.to).toBe("2026-10-07");
    expect(window.days).toHaveLength(7);
    expect(reportingWindow(90, new Date("2026-10-07T23:59:59Z")).from).toBe("2026-07-10");
    expect(reportingWindow(30, new Date("2026-03-01T00:00:00Z")).days.slice(0, 2)).toEqual(["2026-01-31", "2026-02-01"]);
  });

  it("emits one bucket per day and marks days without searches", () => {
    const { days } = reportingWindow(7, new Date("2026-10-07T12:00:00Z"));
    const daily = fillDailyBuckets(days, [
      { day: "2026-10-03", searches: 4, zeroResultSearches: 1, clickedSearches: 2, p50LatencyMs: 6, p95LatencyMs: 19 },
      { day: "2026-10-07", searches: 1, zeroResultSearches: 0, clickedSearches: 0, p50LatencyMs: 3, p95LatencyMs: 3 },
    ]);
    expect(daily.map((day) => day.date)).toEqual(days);
    expect(daily[2]).toEqual({ date: "2026-10-03", searches: 4, zeroResultSearches: 1, clickedSearches: 2, p50LatencyMs: 6, p95LatencyMs: 19 });
    // An empty day is a real zero for volume and "no value" for latency.
    expect(daily[0]).toEqual({ date: "2026-10-01", searches: 0, zeroResultSearches: 0, clickedSearches: 0, p50LatencyMs: null, p95LatencyMs: null });
  });
});

describe("getInsights", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("queries the validated window and takes period percentiles from raw events", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("total_searches")) {
        return { rows: [{ total_searches: "10", unique_queries: "4", avg_latency_ms: "8.4", p50_latency_ms: "5", p95_latency_ms: "41", zero_result_searches: "2", clicked_searches: "3" }] };
      }
      if (sql.includes("date_trunc")) {
        return { rows: [{ day: "2026-10-06", searches: "9", zero_result_searches: "2", clicked_searches: "3", p50_latency_ms: "5", p95_latency_ms: "12" }, { day: "2026-10-07", searches: "1", zero_result_searches: "0", clicked_searches: "0", p50_latency_ms: "90", p95_latency_ms: "90" }] };
      }
      return { rows: [] };
    });

    const insights = await getInsights(7, new Date("2026-10-07T12:00:00Z"));

    expect(insights).toMatchObject({ mode: "live", periodDays: 7, timezone: "UTC", from: "2026-10-01", to: "2026-10-07", totalSearches: 10, zeroResultRate: 20, clickThroughRate: 30 });
    // The period p95 comes from the database's percentile over all events
    // (41 ms), not from averaging the two daily p95 values (51 ms).
    expect(insights.p95LatencyMs).toBe(41);
    expect(insights.daily).toHaveLength(7);
    expect(insights.daily.reduce((sum, day) => sum + day.searches, 0)).toBe(10);

    for (const [sql, parameters] of query.mock.calls as Array<[string, string[]]>) {
      expect(parameters).toEqual(["2026-10-01", "2026-10-07"]);
      expect(sql).toContain("created_at >= $1::date AND created_at < ($2::date + 1)");
      expect(sql).not.toContain("INTERVAL");
    }
    const totalsSql = (query.mock.calls as Array<[string]>)[0][0];
    expect(totalsSql).toContain("PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)");
  });

  it("attributes clicks to the search they followed", async () => {
    query.mockResolvedValue({ rows: [] });
    await getInsights(30, new Date("2026-10-07T12:00:00Z"));
    for (const [sql] of query.mock.calls as Array<[string]>) {
      expect(sql).toContain("JOIN searches s ON s.search_id = c.search_id");
    }
  });

  it("reports unavailable, not zero, when the database fails", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    const insights = await getInsights(90, new Date("2026-10-07T12:00:00Z"));
    expect(insights).toMatchObject({ mode: "unavailable", periodDays: 90, daily: [] });
  });
});
