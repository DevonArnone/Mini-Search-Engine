import { ArrowRight, BarChart3, Database, ExternalLink, Gauge, GitBranch, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { HomeSearch } from "@/components/home-search";
import { SourceMark } from "@/components/source-mark";
import { SOURCE_DEFINITIONS } from "@/lib/sources";
import { getStatus } from "@/lib/status";

const SAMPLE_QUERIES = ["useState cleanup", "CSS subgrid", "TypeScript generics", "PostgreSQL indexes"];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function sourceStatus(status: string) {
  if (status === "healthy") return { label: "Current", color: "bg-emerald-500" };
  if (status === "crawling") return { label: "Crawling", color: "bg-blue-500" };
  if (status === "failing") return { label: "Needs attention", color: "bg-rose-500" };
  return { label: "Pending", color: "bg-slate-300" };
}

export default async function HomePage() {
  const status = await getStatus();
  const liveSources = status.sources.filter((source) => source.docCount > 0).length;
  const statusBySlug = new Map(status.sources.map((source) => [source.slug, source]));
  const live = status.mode === "live" && status.searchEngine.healthy && status.database.healthy;

  return (
    <main id="main-content">
      <section className="border-b border-line bg-white">
        <div className="section-shell grid min-h-[580px] content-center gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted">
              <span className={`status-dot ${live ? "bg-emerald-500" : "bg-amber-400"}`} />
              {live ? "Live documentation index" : "Local services are not connected"}
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">DevDocs Search</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Search MDN, React, Next.js, TypeScript, and PostgreSQL documentation through one ranked, filterable index.</p>
            <div className="mt-8 max-w-2xl"><HomeSearch /></div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Try</span>
              {SAMPLE_QUERIES.map((query) => <Link className="rounded px-2 py-1 font-medium text-teal-800 hover:bg-teal-50" href={`/search?q=${encodeURIComponent(query)}`} key={query}>{query}</Link>)}
            </div>
          </div>

          <div className="border-l-0 border-line lg:border-l lg:pl-10">
            <p className="eyebrow">Indexed coverage</p>
            <div className="mt-4 space-y-3">
              {SOURCE_DEFINITIONS.map((source) => {
                const current = statusBySlug.get(source.slug);
                return (
                  <Link className="flex min-h-11 items-center gap-3 rounded-md px-2 transition-colors hover:bg-slate-50" href={`/sources/${source.slug}`} key={source.slug}>
                    <SourceMark size="sm" slug={source.slug} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{source.shortName}</span>
                    <span className="font-mono text-xs text-muted">{current?.docCount ? formatNumber(current.docCount) : "—"}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-6 grid grid-cols-3 border-t border-line pt-5 text-center lg:text-left">
              <div><strong className="block text-xl font-semibold text-ink">{status.indexedDocuments ? formatNumber(status.indexedDocuments) : "—"}</strong><span className="text-xs text-muted">documents</span></div>
              <div><strong className="block text-xl font-semibold text-ink">{SOURCE_DEFINITIONS.length}</strong><span className="text-xs text-muted">sources</span></div>
              <div><strong className="block text-xl font-semibold text-ink">{liveSources}</strong><span className="text-xs text-muted">indexed</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="eyebrow">Built for retrieval</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Useful as a tool. Inspectable as a system.</h2>
          <p className="mt-3 text-sm leading-6 text-muted">The interface stays focused on finding documentation while exposing the quality, freshness, and operational signals behind each result.</p>
        </div>
        <div className="mt-10 grid border-y border-line md:grid-cols-3">
          {[
            { icon: Search, title: "Ranked full-text search", body: "Title, heading, section, source authority, and document quality signals shape each result." },
            { icon: GitBranch, title: "Controlled crawl pipeline", body: "Domain-aware queues, robots checks, retries, extraction, deduplication, and incremental indexing." },
            { icon: BarChart3, title: "Actionable relevance data", body: "Search and click events identify zero-result queries, low engagement, and coverage gaps." },
          ].map(({ icon: Icon, title, body }, index) => (
            <div className={`py-6 md:px-7 ${index > 0 ? "border-t border-line md:border-l md:border-t-0" : ""}`} key={title}>
              <Icon aria-hidden className="h-5 w-5 text-teal-700" />
              <h3 className="mt-4 font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-white py-16">
        <div className="section-shell">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="eyebrow">Source health</p><h2 className="mt-2 text-2xl font-semibold text-ink">Current index coverage</h2></div>
            <Link className="button-secondary" href="/sources">Browse all sources<ArrowRight aria-hidden className="h-4 w-4" /></Link>
          </div>
          <div className="mt-8 overflow-hidden rounded-lg border border-line">
            {SOURCE_DEFINITIONS.map((source, index) => {
              const current = statusBySlug.get(source.slug);
              const currentStatus = sourceStatus(current?.crawlStatus ?? "pending");
              return (
                <div className={`grid gap-4 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_140px_140px_24px] sm:items-center ${index ? "border-t border-line" : ""}`} key={source.slug}>
                  <div className="flex min-w-0 items-center gap-3"><SourceMark slug={source.slug} /><div className="min-w-0"><p className="font-medium text-ink">{source.name}</p><p className="truncate text-xs text-muted">{source.description}</p></div></div>
                  <span className="inline-flex items-center gap-2 text-xs text-muted"><span className={`status-dot ${currentStatus.color}`} />{currentStatus.label}</span>
                  <span className="text-sm text-muted">{current?.docCount ? `${current.docCount.toLocaleString()} documents` : "Awaiting crawl"}</span>
                  <Link aria-label={`Browse ${source.name}`} className="icon-button h-8 w-8" href={`/sources/${source.slug}`}><ArrowRight aria-hidden className="h-4 w-4" /></Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-20">
        <p className="eyebrow">Architecture</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">From source URL to ranked result</h2>
        <ol className="mt-8 grid gap-0 overflow-hidden rounded-lg border border-line bg-white md:grid-cols-4">
          {[
            { icon: ShieldCheck, title: "Fetch", body: "Respect source policy and rate limits." },
            { icon: Database, title: "Extract", body: "Normalize metadata, content, and links." },
            { icon: Gauge, title: "Index", body: "Apply facets and ranking signals." },
            { icon: Search, title: "Retrieve", body: "Serve fast, explainable results." },
          ].map(({ icon: Icon, title, body }, index) => (
            <li className={`p-5 ${index ? "border-t border-line md:border-l md:border-t-0" : ""}`} key={title}>
              <div className="flex items-center justify-between"><Icon aria-hidden className="h-5 w-5 text-teal-700" /><span className="font-mono text-xs text-slate-600">0{index + 1}</span></div>
              <h3 className="mt-6 font-semibold text-ink">{title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <a className="button-secondary" href="https://github.com/DevonArnone/Mini-Search-Engine" rel="noopener noreferrer" target="_blank">View repository<ExternalLink aria-hidden className="h-4 w-4" /></a>
          <Link className="button-ghost" href="/insights">Open search insights<ArrowRight aria-hidden className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
}
