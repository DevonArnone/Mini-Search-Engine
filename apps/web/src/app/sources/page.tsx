import type { Metadata } from "next";
import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import { SourceMark } from "@/components/source-mark";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import { getSources } from "@/lib/sources-service";

export const metadata: Metadata = {
  title: "Sources",
  description: "Browse the official documentation sources indexed by DevDocs Search.",
};

function cadence(hours: number) {
  if (hours >= 720) return `${Math.round(hours / 720)} month${hours >= 1440 ? "s" : ""}`;
  if (hours >= 168) return `${Math.round(hours / 168)} week${hours >= 336 ? "s" : ""}`;
  if (hours >= 24) return `${Math.round(hours / 24)} day${hours >= 48 ? "s" : ""}`;
  return `${hours} hours`;
}

function statusLabel(status: string) {
  if (status === "healthy") return { label: "Healthy", dot: "bg-emerald-500" };
  if (status === "crawling") return { label: "Crawling", dot: "bg-blue-500" };
  if (status === "failing") return { label: "Failing", dot: "bg-rose-500" };
  return { label: "Pending", dot: "bg-slate-300" };
}

export default async function SourcesPage() {
  const response = await getSources();
  const totalDocuments = response.sources.reduce((total, source) => total + source.docCount, 0);

  return (
    <main className="section-shell min-h-[calc(100vh-var(--header-height))] py-8 sm:py-12" id="main-content">
      <header className="max-w-3xl">
        <p className="eyebrow">Coverage registry</p>
        <h1 className="page-heading mt-2">Official documentation sources</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{totalDocuments ? `${totalDocuments.toLocaleString()} indexed documents across ${response.sources.length} maintained sources.` : `${response.sources.length} configured sources awaiting a connected crawl and index.`}</p>
      </header>

      {response.mode === "unavailable" ? <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Live source metrics are unavailable. Configuration details remain available below.</div> : null}

      <div className="mt-8 overflow-hidden rounded-lg border border-line bg-white shadow-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_130px_150px_120px] border-b border-line bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted md:grid">
          <span>Source</span><span>Status</span><span>Coverage</span><span className="sr-only">Actions</span>
        </div>
        {response.sources.map((source, index) => {
          const definition = SOURCE_BY_SLUG.get(source.slug);
          const health = statusLabel(source.crawlStatus);
          return (
            <article className={`grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_130px_150px_120px] md:items-center ${index ? "border-t border-line" : ""}`} key={source.slug}>
              <div className="flex min-w-0 items-start gap-3">
                <SourceMark slug={source.slug} />
                <div className="min-w-0"><h2 className="font-semibold text-ink">{source.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">{definition?.description ?? source.description}</p></div>
              </div>
              <div className="inline-flex items-center gap-2 text-sm text-muted"><span className={`status-dot ${health.dot}`} />{health.label}</div>
              <div className="text-sm text-muted"><strong className="block font-medium text-ink">{source.docCount ? source.docCount.toLocaleString() : "No documents"}</strong><span className="text-xs">Every {cadence(source.crawlCadenceHours)}</span></div>
              <div className="flex gap-1 md:justify-end">
                <Link aria-label={`Browse ${source.name}`} className="icon-button" href={`/sources/${source.slug}`} title={`Browse ${source.name}`}><ArrowRight aria-hidden className="h-4 w-4" /></Link>
                <a aria-label={`Open ${source.name} official site`} className="icon-button" href={source.homeUrl} rel="noopener noreferrer" target="_blank" title="Official site"><ExternalLink aria-hidden className="h-4 w-4" /></a>
              </div>
              {definition?.sampleQueries.length ? (
                <div className="col-span-full flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs"><span className="mr-1 text-muted">Try</span>{definition.sampleQueries.slice(0, 4).map((query) => <Link className="rounded bg-slate-50 px-2 py-1 text-slate-600 hover:bg-teal-50 hover:text-teal-800" href={`/search?q=${encodeURIComponent(query)}&source=${source.slug}`} key={query}>{query}</Link>)}</div>
              ) : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}
