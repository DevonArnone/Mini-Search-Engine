import type { Metadata } from "next";
import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";

import type { InsightsResponse } from "@mini-search/shared-types";

import { LatencyChart, VolumeChart } from "@/components/insights/charts";
import { PeriodTabs } from "@/components/insights/period-tabs";
import { StatusOverview } from "@/components/status-overview";
import { formatCount, formatDay } from "@/lib/format";
import { DEFAULT_INSIGHTS_PERIOD, getInsights, parseInsightsPeriod } from "@/lib/insights";
import { SOURCE_BY_SLUG, SOURCE_DEFINITIONS } from "@/lib/sources";
import { getStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Insights", description: "Query volume, latency, and search quality for DevDocs Search." };

function QueryTable({ id, title, description, rows, empty }: { id: string; title: string; description: string; rows: InsightsResponse["topQueries"]; empty: string }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 className="heading" id={id}>{title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="data-table min-w-[26rem]">
            <thead>
              <tr><th scope="col">Query</th><th className="text-right" scope="col">Searches</th><th className="text-right" scope="col">Avg. results</th><th className="text-right" scope="col">Avg. latency</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.query}>
                  <th className="max-w-[16rem] truncate" scope="row"><Link className="link text-ink" href={`/search?q=${encodeURIComponent(row.query)}`}>{row.query}</Link></th>
                  <td className="text-right font-mono text-xs text-ink-soft">{formatCount(row.count)}</td>
                  <td className="text-right font-mono text-xs text-ink-soft">{formatCount(row.avgResults)}</td>
                  <td className="text-right font-mono text-xs text-ink-soft">{row.avgLatencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 border-t border-rule-strong pt-3 text-sm text-ink-soft">{empty}</p>}
    </section>
  );
}

function Figure({ id, title, summary, children, table }: { id: string; title: string; summary: string; children: React.ReactNode; table: React.ReactNode }) {
  return (
    <figure aria-labelledby={id} className="min-w-0">
      <figcaption>
        <h3 className="heading" id={id}>{title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{summary}</p>
      </figcaption>
      <div aria-hidden className="mt-4">{children}</div>
      <details className="mt-2 text-sm">
        <summary className="inline-flex min-h-9 cursor-pointer items-center font-medium text-ink-soft hover:text-ink">View as a table</summary>
        <div className="mt-2 max-h-72 overflow-auto border-t border-rule-strong">{table}</div>
      </details>
    </figure>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  const requested = (await searchParams).period;
  const parsedPeriod = parseInsightsPeriod(requested);
  const periodDays = parsedPeriod ?? DEFAULT_INSIGHTS_PERIOD;
  const [insights, status] = await Promise.all([getInsights(periodDays), getStatus()]);
  const live = insights.mode === "live";
  const hasSearches = live && insights.totalSearches > 0;

  const busiest = hasSearches ? insights.daily.reduce((best, day) => (day.searches > best.searches ? day : best)) : null;
  const activeDays = insights.daily.filter((day) => day.searches > 0).length;
  const totalClicks = insights.topSources.reduce((sum, source) => sum + source.count, 0);
  const maxClicks = Math.max(1, ...insights.topSources.map((source) => source.count));
  const clicksBySlug = new Map(insights.topSources.map((source) => [source.value, source.count]));

  const figures = [
    { label: "Searches", value: formatCount(insights.totalSearches), note: `${formatCount(insights.uniqueQueries)} distinct queries` },
    { label: "Median latency", value: `${insights.p50LatencyMs} ms`, note: `95th percentile ${insights.p95LatencyMs} ms` },
    { label: "Click-through", value: `${insights.clickThroughRate}%`, note: "searches followed by a result click" },
    { label: "No results", value: `${insights.zeroResultRate}%`, note: "searches that matched nothing" },
  ];

  return (
    <main className="page min-h-[calc(100vh-var(--header-height))] pb-8 pt-10 sm:pt-14" id="main-content">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-[clamp(2.25rem,5vw,3.75rem)]">Insights</h1>
          <p className="mt-3 max-w-prose text-ink-soft">
            What people searched for and how the engine answered, {formatDay(insights.from)} to {formatDay(insights.to)}. Days are UTC calendar days; latency is the full request as timed on the server.
          </p>
        </div>
        <PeriodTabs current={periodDays} />
      </header>

      {parsedPeriod === null ? (
        <p className="notice mt-6" role="status"><TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />That reporting period is not available. Showing the last 30 days instead; choose 7, 30, or 90 days.</p>
      ) : null}

      {!live ? (
        <div className="notice mt-8 border-bad" role="alert">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
          <div>
            <p className="font-semibold">Analytics are unavailable.</p>
            <p className="mt-0.5 text-ink-soft">PostgreSQL is not connected, so no search events can be read. This is a service failure, not an empty period.</p>
          </div>
        </div>
      ) : !hasSearches ? (
        <div className="mt-10 max-w-xl border-t border-rule-strong pt-6">
          <h2 className="font-display text-2xl font-medium text-ink">No searches in the last {periodDays} days.</h2>
          <p className="mt-2 text-sm text-ink-soft">Each submitted query is recorded once, with its result count and latency. Run a search and it will appear here, or widen the period.</p>
          <Link className="button mt-5" href="/search">Run a search<ArrowRight aria-hidden className="h-4 w-4" /></Link>
        </div>
      ) : (
        <>
          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-rule-strong py-6 lg:grid-cols-4">
            {figures.map((figure) => (
              <div key={figure.label}>
                <dt className="label">{figure.label}</dt>
                <dd className="mt-1 font-display text-3xl font-medium text-ink sm:text-4xl" style={{ fontVariantNumeric: "tabular-nums" }}>{figure.value}</dd>
                <dd className="mt-1 text-xs text-ink-soft">{figure.note}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 grid gap-x-12 gap-y-12 xl:grid-cols-2">
            <Figure
              id="volume-heading"
              summary={`${formatCount(insights.totalSearches)} searches on ${activeDays} of ${periodDays} days${busiest ? `; the busiest was ${formatDay(busiest.date)} with ${formatCount(busiest.searches)}` : ""}.`}
              table={
                <table className="data-table">
                  <thead><tr><th scope="col">Day (UTC)</th><th className="text-right" scope="col">Searches</th><th className="text-right" scope="col">No results</th><th className="text-right" scope="col">Clicked</th></tr></thead>
                  <tbody>{insights.daily.map((day) => <tr key={day.date}><td className="font-mono text-xs">{day.date}</td><td className="text-right font-mono text-xs">{day.searches}</td><td className="text-right font-mono text-xs">{day.zeroResultSearches}</td><td className="text-right font-mono text-xs">{day.clickedSearches}</td></tr>)}</tbody>
                </table>
              }
              title="Searches per day"
            >
              <VolumeChart daily={insights.daily} />
            </Figure>

            <Figure
              id="latency-heading"
              summary={`Over the whole period the median request took ${insights.p50LatencyMs} ms and 95% finished within ${insights.p95LatencyMs} ms. Days without searches have no point.`}
              table={
                <table className="data-table">
                  <thead><tr><th scope="col">Day (UTC)</th><th className="text-right" scope="col">Median</th><th className="text-right" scope="col">95th percentile</th></tr></thead>
                  <tbody>{insights.daily.map((day) => <tr key={day.date}><td className="font-mono text-xs">{day.date}</td><td className="text-right font-mono text-xs">{day.p50LatencyMs === null ? "no searches" : `${day.p50LatencyMs} ms`}</td><td className="text-right font-mono text-xs">{day.p95LatencyMs === null ? "no searches" : `${day.p95LatencyMs} ms`}</td></tr>)}</tbody>
                </table>
              }
              title="Latency per day"
            >
              <LatencyChart daily={insights.daily} />
            </Figure>
          </div>

          <section aria-labelledby="sources-heading" className="mt-14">
            <h2 className="heading" id="sources-heading">Result clicks by source</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {totalClicks ? `${formatCount(totalClicks)} result ${totalClicks === 1 ? "click" : "clicks"}, counted against the search each one followed.` : "No result has been opened from a search in this period."}
            </p>
            {totalClicks ? (
              <ul className="mt-4 border-t border-rule-strong">
                {SOURCE_DEFINITIONS.map((source) => {
                  const clicks = clicksBySlug.get(source.slug) ?? 0;
                  return (
                    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_4rem] items-center gap-3 border-b border-rule py-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_5rem]" data-source={source.slug} key={source.slug}>
                      <Link className="link truncate text-ink" href={`/sources/${source.slug}`}>{SOURCE_BY_SLUG.get(source.slug)?.shortName}</Link>
                      <span aria-hidden className="h-4 bg-paper-sunk"><span className="block h-full bg-cloth" style={{ width: `${(clicks / maxClicks) * 100}%`, minWidth: clicks ? 2 : 0 }} /></span>
                      <span className="text-right font-mono text-xs text-ink">{formatCount(clicks)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <div className="mt-14 grid gap-x-12 gap-y-12 xl:grid-cols-2">
            <QueryTable description="The queries submitted most often." empty="No queries in this period." id="top-queries" rows={insights.topQueries} title="Most frequent queries" />
            <QueryTable description="Queries that matched no document: gaps in coverage or vocabulary." empty="Every query in this period returned at least one result." id="zero-queries" rows={insights.zeroResultQueries} title="Queries with no results" />
            <div className="xl:col-span-2">
              <QueryTable description="Searched at least three times, with results, but opened less than one time in five." empty="No query meets this threshold in the period." id="low-click-queries" rows={insights.lowClickQueries} title="Results nobody opened" />
            </div>
          </div>
        </>
      )}

      <div className="mt-14"><StatusOverview status={status} /></div>
    </main>
  );
}
