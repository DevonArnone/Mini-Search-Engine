import Link from "next/link";

import type { SourceInfo, StatusResponse } from "@mini-search/shared-types";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function crawlStatusDot(status: SourceInfo["crawlStatus"]) {
  const colors: Record<string, string> = {
    healthy: "bg-emerald-400",
    crawling: "bg-blue-400",
    failing: "bg-rose-400",
    pending: "bg-stone-300",
  };
  return colors[status] ?? colors.pending;
}

export function StatusOverview({ status }: { status: StatusResponse }) {
  const cards = [
    { label: "Indexed documents", value: formatNumber(status.indexedDocuments), tone: "text-ink" },
    { label: "Queued URLs", value: formatNumber(status.queuedDocuments), tone: "text-ocean" },
    { label: "Analytics events", value: formatNumber(status.analyticsEvents), tone: "text-emerald-700" },
    { label: "Crawl failures", value: formatNumber(status.crawlFailures), tone: "text-amber-700" },
  ];

  return (
    <section className="space-y-5">
      {/* Health badges */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`status-pill ${
            status.mode === "live"
              ? "text-emerald-700"
              : "text-amber-700"
          }`}
        >
          {status.mode === "live" ? "Live index" : "Demo fallback"}
        </span>
        <span
          className={`status-pill ${
            status.searchEngine.healthy ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          Search: {status.searchEngine.healthy ? "Healthy" : "Unavailable"}
        </span>
        <span
          className={`status-pill ${
            status.database.healthy ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          Database: {status.database.healthy ? "Healthy" : "Unavailable"}
        </span>
        <Link className="ml-auto text-xs font-semibold text-ocean hover:underline" href="/insights">
          View insights →
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            className="metric-card"
            key={card.label}
          >
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className={`mt-3 font-display text-3xl font-bold ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </div>

      {/* Source health table */}
      {status.sources && status.sources.length > 0 ? (
        <article className="premium-card p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="section-kicker">
                Source health
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">
                Indexed documentation sources
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              {new Date(status.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="space-y-2">
            {status.sources.map((source) => (
              <div
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white/70 px-4 py-3"
                key={source.slug}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${crawlStatusDot(source.crawlStatus)}`}
                  />
                  <Link
                    className="text-sm font-semibold text-ink hover:text-ocean"
                    href={`/sources/${source.slug}`}
                  >
                    {source.name}
                  </Link>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {source.docCount > 0 ? (
                    <span>{formatNumber(source.docCount)} docs</span>
                  ) : (
                    <span className="text-slate-400">Pending crawl</span>
                  )}
                  <span className="capitalize">{source.crawlStatus}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Duplicate content groups: {formatNumber(status.duplicateGroups)}. Crawl failures: {formatNumber(status.crawlFailures)}.
          </p>
        </article>
      ) : null}
    </section>
  );
}
