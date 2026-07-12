import type { Metadata } from "next";
import { ArrowRight, SearchX } from "lucide-react";
import Link from "next/link";

import type { InsightsResponse } from "@mini-search/shared-types";

import { StatusOverview } from "@/components/status-overview";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import { getInsights } from "@/lib/insights";
import { getStatus } from "@/lib/status";

export const metadata: Metadata = { title: "Insights", description: "Search quality and system health signals for DevDocs Search." };

function QueryTable({ title, description, rows }: { title: string; description: string; rows: InsightsResponse["topQueries"] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">{title}</h2><p className="mt-0.5 text-xs text-muted">{description}</p></div>
      {rows.length ? (
        <div className="overflow-x-auto"><table className="data-table min-w-[620px]"><thead><tr><th>Query</th><th className="text-right">Searches</th><th className="text-right">Avg results</th><th className="text-right">Avg latency</th></tr></thead><tbody>{rows.map((row) => <tr className="hover:bg-slate-50" key={row.query}><td><Link className="font-medium text-teal-800 hover:underline" href={`/search?q=${encodeURIComponent(row.query)}`}>{row.query}</Link></td><td className="text-right font-mono text-xs text-muted">{row.count.toLocaleString()}</td><td className="text-right font-mono text-xs text-muted">{row.avgResults.toLocaleString()}</td><td className="text-right font-mono text-xs text-muted">{row.avgLatencyMs}ms</td></tr>)}</tbody></table></div>
      ) : <div className="px-4 py-8 text-center text-sm text-muted">No qualifying queries in this period.</div>}
    </section>
  );
}

export default async function InsightsPage() {
  const [insights, status] = await Promise.all([getInsights(), getStatus()]);
  const metrics = [
    { label: "Searches", value: insights.totalSearches.toLocaleString() },
    { label: "Unique queries", value: insights.uniqueQueries.toLocaleString() },
    { label: "Click-through", value: `${insights.clickThroughRate}%` },
    { label: "Zero-result rate", value: `${insights.zeroResultRate}%` },
    { label: "p50 latency", value: `${insights.p50LatencyMs}ms` },
    { label: "p95 latency", value: `${insights.p95LatencyMs}ms` },
  ];

  return (
    <main className="section-shell min-h-[calc(100vh-var(--header-height))] py-8 sm:py-12" id="main-content">
      <header><p className="eyebrow">Quality dashboard</p><h1 className="page-heading mt-2">Search insights</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Retrieval quality, engagement, and service health for the {insights.period}.</p></header>

      {insights.mode === "unavailable" ? <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Analytics are unavailable because PostgreSQL is not connected. This is distinct from an empty reporting period.</div> : null}

      <section className="panel mt-7 grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-6" aria-label="Search metrics">
        {metrics.map((metric, index) => <div className={`px-4 py-4 ${index ? "border-l border-line" : ""} ${index >= 2 ? "border-t border-line sm:border-t-0" : ""} ${index === 3 ? "sm:border-l" : ""}`} key={metric.label}><p className="text-xs text-muted">{metric.label}</p><p className="mt-1 text-xl font-semibold text-ink">{metric.value}</p></div>)}
      </section>

      {insights.mode === "live" && insights.totalSearches === 0 ? (
        <div className="panel mt-6 px-6 py-10 text-center"><SearchX aria-hidden className="mx-auto h-7 w-7 text-slate-400" /><h2 className="mt-3 font-semibold text-ink">No search events yet</h2><p className="mt-1 text-sm text-muted">Completed queries will appear here without counting empty page loads.</p><Link className="button-primary mt-5" href="/search">Run a search<ArrowRight aria-hidden className="h-4 w-4" /></Link></div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <QueryTable description="Most frequent completed queries." rows={insights.topQueries} title="Top queries" />
        <QueryTable description="Queries with no matching documents." rows={insights.zeroResultQueries} title="Zero-result queries" />
        <div className="xl:col-span-2"><QueryTable description="Frequently searched queries with click-through below 20%." rows={insights.lowClickQueries} title="Low-click queries" /></div>
      </div>

      {insights.topSources.length ? (
        <section className="panel mt-6 p-4"><h2 className="text-sm font-semibold text-ink">Most-clicked sources</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{insights.topSources.map((source) => <Link className="rounded-md border border-line p-3 hover:border-teal-300 hover:bg-teal-50" href={`/sources/${source.value}`} key={source.value}><p className="text-sm font-medium text-ink">{SOURCE_BY_SLUG.get(source.value)?.shortName ?? source.value}</p><p className="mt-1 font-mono text-xs text-muted">{source.count.toLocaleString()} clicks</p></Link>)}</div></section>
      ) : null}

      <div className="mt-6"><StatusOverview status={status} /></div>
    </main>
  );
}
