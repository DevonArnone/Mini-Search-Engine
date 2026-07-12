import type { Metadata } from "next";
import Link from "next/link";

import type { InsightsResponse } from "@mini-search/shared-types";

export const metadata: Metadata = {
  title: "Insights",
  description: "Search quality signals — top queries, zero-result queries, and most-used sources.",
};

async function getInsights(): Promise<InsightsResponse> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/insights`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error("Failed");
    return res.json() as Promise<InsightsResponse>;
  } catch {
    return {
      totalSearches: 0,
      uniqueQueries: 0,
      zeroResultQueries: [],
      topQueries: [],
      lowClickQueries: [],
      topSources: [],
      avgLatencyMs: 0,
      period: "last 30 days",
    };
  }
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <article className="metric-card">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold text-ink">{typeof value === "number" ? formatNumber(value) : value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
    </article>
  );
}

function QueryTable({
  title,
  description,
  rows,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: InsightsResponse["topQueries"];
  emptyMessage: string;
}) {
  return (
    <section className="premium-card p-5">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {rows.length ? (
        <div className="table-premium mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60 text-xs text-slate-400">
                <th className="px-4 py-3 text-left font-semibold">Query</th>
                <th className="px-4 py-3 text-right font-semibold">Searches</th>
                <th className="px-4 py-3 text-right font-semibold">Avg results</th>
                <th className="px-4 py-3 text-right font-semibold">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b border-slate-100/80 last:border-0 hover:bg-white/70" key={row.query}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold text-ocean hover:underline"
                      href={`/search?q=${encodeURIComponent(row.query)}`}
                    >
                      {row.query}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.count)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.avgResults)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.avgLatencyMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-slate-400">{emptyMessage}</p>
      )}
    </section>
  );
}

export default async function InsightsPage() {
  const insights = await getInsights();

  const SOURCE_NAMES: Record<string, string> = {
    mdn: "MDN Web Docs",
    react: "React Docs",
    nextjs: "Next.js Docs",
    typescript: "TypeScript Handbook",
    postgresql: "PostgreSQL Docs",
  };

  return (
    <main id="main-content" className="section-shell py-12">
      <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/70 bg-white/[0.72] p-6 shadow-premium backdrop-blur-xl sm:p-8">
        <p className="section-kicker">Analytics</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Search insights
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Usage patterns, quality signals, and relevance gaps — {insights.period}.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total searches" value={insights.totalSearches} sub={insights.period} />
        <StatCard label="Unique queries" value={insights.uniqueQueries} />
        <StatCard label="Avg latency" value={`${insights.avgLatencyMs}ms`} />
        <StatCard
          label="Zero-result queries"
          value={insights.zeroResultQueries.length}
          sub="distinct queries with no hits"
        />
      </div>

      {/* Tables */}
      <div className="space-y-6">
        <QueryTable
          description="Queries searched most often in the last 30 days."
          emptyMessage="No searches recorded yet. Run a few searches to see data here."
          rows={insights.topQueries}
          title="Top queries"
        />
        <QueryTable
          description="Queries that returned zero results — candidates for content or ranking improvements."
          emptyMessage="No zero-result queries. Great relevance coverage!"
          rows={insights.zeroResultQueries}
          title="Zero-result queries"
        />
        <QueryTable
          description="Searched frequently but rarely clicked — results may not match intent."
          emptyMessage="Insufficient click data yet. Keep searching to generate signals."
          rows={insights.lowClickQueries}
          title="Low-click queries"
        />

        {/* Top sources */}
        {insights.topSources.length > 0 ? (
          <section className="premium-card p-5">
            <h2 className="font-display text-lg font-bold text-ink">Most-clicked sources</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sources that receive the most result clicks, by click-through count.
            </p>
            <div className="mt-4 space-y-3">
              {insights.topSources.map((source) => {
                const max = insights.topSources[0]?.count ?? 1;
                const pct = Math.round((source.count / max) * 100);
                return (
                  <div key={source.value}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <Link
                        className="font-semibold text-ocean hover:underline"
                        href={`/sources/${source.value}`}
                      >
                        {SOURCE_NAMES[source.value] ?? source.value}
                      </Link>
                      <span className="text-slate-500">{formatNumber(source.count)} clicks</span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-ocean to-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* No data state */}
        {insights.totalSearches === 0 ? (
          <div className="rounded-3xl border border-dashed border-teal-200 bg-white/70 p-10 text-center shadow-soft backdrop-blur-xl">
            <h3 className="font-display text-xl font-bold text-ink">No analytics data yet</h3>
            <p className="mt-2 text-sm text-slate-500">
              Search a few queries to start generating insights.
            </p>
            <Link
              className="btn-primary mt-4 px-5 py-2"
              href="/search"
            >
              Go to search
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
