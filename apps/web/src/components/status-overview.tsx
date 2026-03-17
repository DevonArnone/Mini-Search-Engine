import type { StatusResponse } from "@mini-search/shared-types";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function StatusOverview({ status }: { status: StatusResponse }) {
  const cards = [
    {
      label: "Indexed documents",
      value: formatNumber(status.indexedDocuments),
      tone: "text-ink",
    },
    {
      label: "Queued URLs",
      value: formatNumber(status.queuedDocuments),
      tone: "text-ocean",
    },
    {
      label: "Analytics events",
      value: formatNumber(status.analyticsEvents),
      tone: "text-emerald-700",
    },
    {
      label: "Duplicate documents",
      value: formatNumber(status.duplicateDocuments),
      tone: "text-amber-700",
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-ink">
          Mode: {status.mode === "live" ? "Live index" : "Demo fallback"}
        </span>
        <span className="rounded-full bg-white/80 px-3 py-1 text-stone-600">
          Search: {status.searchEngine.healthy ? "Healthy" : "Unavailable"}
        </span>
        <span className="rounded-full bg-white/80 px-3 py-1 text-stone-600">
          Database: {status.database.healthy ? "Healthy" : "Unavailable"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            className="rounded-[1.75rem] border border-orange-200 bg-white/80 p-5 shadow-sm"
            key={card.label}
          >
            <p className="text-sm text-stone-500">{card.label}</p>
            <p className={`mt-3 font-display text-3xl font-semibold ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </div>

      <article className="rounded-[1.75rem] border border-orange-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-ocean">Index Snapshot</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
              Top indexed domains
            </h2>
          </div>
          <p className="text-sm text-stone-500">
            Generated {new Date(status.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {status.topDomains.length ? (
            status.topDomains.map((domain) => (
              <div
                className="rounded-2xl bg-sand px-4 py-3 text-sm text-stone-700"
                key={domain.value}
              >
                <p className="truncate font-medium text-ink">{domain.value}</p>
                <p className="mt-1">{formatNumber(domain.count)} documents</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-sand px-4 py-3 text-sm text-stone-700">
              No indexed domains yet.
            </div>
          )}
        </div>
        <p className="mt-4 text-sm text-stone-500">
          Duplicate content groups: {formatNumber(status.duplicateGroups)}. Crawl failures logged:{" "}
          {formatNumber(status.crawlFailures)}.
        </p>
      </article>
    </section>
  );
}
