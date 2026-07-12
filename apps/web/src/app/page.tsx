import Link from "next/link";

import { getStatus } from "@/lib/status";

const SOURCES = [
  {
    slug: "mdn",
    name: "MDN Web Docs",
    icon: "M",
    color: "bg-blue-50 text-blue-700 ring-blue-100",
    description: "HTML, CSS, JavaScript, and browser APIs",
  },
  {
    slug: "react",
    name: "React",
    icon: "⚛",
    color: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    description: "Components, hooks, and rendering patterns",
  },
  {
    slug: "nextjs",
    name: "Next.js",
    icon: "N",
    color: "bg-stone-50 text-stone-700 ring-stone-200",
    description: "App Router, Server Components, and APIs",
  },
  {
    slug: "typescript",
    name: "TypeScript",
    icon: "TS",
    color: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    description: "Types, generics, and the handbook",
  },
  {
    slug: "postgresql",
    name: "PostgreSQL",
    icon: "PG",
    color: "bg-teal-50 text-teal-700 ring-teal-100",
    description: "SQL reference, functions, and tuning",
  },
];

const SAMPLE_QUERIES = [
  "useState hook",
  "CSS flexbox",
  "App Router",
  "TypeScript generics",
  "SQL joins",
  "fetch API",
  "async/await",
  "React Server Components",
];

const ARCHITECTURE_POINTS = [
  {
    title: "Python Crawler",
    detail:
      "Async BFS with per-domain rate limiting, robots.txt compliance, exponential-backoff retries, and content deduplication via SHA-256.",
  },
  {
    title: "PostgreSQL",
    detail:
      "Source registry, crawl queue, document metadata, and search analytics — all in a single normalized schema with additive migrations.",
  },
  {
    title: "Meilisearch",
    detail:
      "Full-text index with custom ranking rules that blend BM25 relevance, authority score, and structural quality signals.",
  },
  {
    title: "Next.js 15",
    detail:
      "App Router with server-rendered pages, client search shell with URL-synced state, debounced autocomplete, and keepalive click analytics.",
  },
];

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function HomePage() {
  const status = await getStatus();
  const totalDocs = status.indexedDocuments;
  const liveSources = status.sources.filter((s) => s.docCount > 0).length;

  return (
    <main id="main-content" className="overflow-hidden">
      {/* Hero ---------------------------------------------------------------- */}
      <section className="section-shell relative pb-20 pt-16 sm:pt-20 lg:pb-28 lg:pt-28">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="absolute -right-28 top-10 h-80 w-80 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_450px]">
          <div className="animate-rise-in">
            <p className="section-kicker">Developer Documentation Search</p>
            <h1 className="mt-5 max-w-4xl font-display text-5xl font-bold tracking-tight text-ink sm:text-6xl md:text-7xl">
              Find the docs you need,{" "}
              <span className="gradient-text">instantly.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              A unified full-text search across MDN, React, Next.js, TypeScript, and PostgreSQL
              official documentation — powered by a real crawl, index, and ranking stack.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link className="btn-primary" href="/search">
                Search Documentation
                <span aria-hidden>→</span>
              </Link>
              <Link className="btn-secondary" href="/sources">
                Browse Sources
              </Link>
            </div>
          </div>

          <div className="premium-card relative animate-float overflow-hidden p-4">
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-teal-300/30 via-indigo-300/25 to-rose-300/25" />
            <div className="relative rounded-[1.35rem] border border-slate-900/10 bg-ink p-4 text-white shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[0.68rem] font-semibold text-teal-100">
                  {status.mode === "live" ? "Live index" : "Demo index"}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                <p className="text-xs text-slate-300">Search query</p>
                <p className="mt-2 font-display text-xl font-semibold">React Server Components</p>
              </div>
              <div className="mt-4 space-y-3">
                {SOURCES.slice(0, 3).map((source, index) => (
                  <div
                    className="rounded-2xl border border-white/10 bg-white/[0.07] p-3"
                    key={source.slug}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{source.name}</span>
                      <span className="text-xs text-teal-100">
                        {index === 0 ? "98" : index === 1 ? "92" : "88"} relevance
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-300 to-indigo-300"
                        style={{ width: `${92 - index * 12}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { value: totalDocs > 0 ? formatNumber(totalDocs) : "—", label: "documents indexed" },
            { value: SOURCES.length, label: "curated sources" },
            { value: liveSources > 0 ? liveSources : SOURCES.length, label: "sources indexed" },
            { value: status.mode === "live" ? "Live" : "Demo", label: "index status", accent: true },
          ].map((stat) => (
            <div className="metric-card" key={stat.label}>
              <p className={`font-display text-3xl font-bold ${stat.accent ? "text-ocean" : "text-ink"}`}>
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Source coverage ----------------------------------------------------- */}
      <section className="border-y border-white/80 bg-white/[0.45] py-20 backdrop-blur-sm">
        <div className="section-shell">
          <p className="section-kicker">Coverage</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
            Indexed sources
          </h2>
          <p className="mt-2 text-slate-500">
            Five authoritative documentation sites, crawled on a regular schedule.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {SOURCES.map((source) => {
              const live = status.sources.find((s) => s.slug === source.slug);
              return (
                <Link
                  className="premium-card premium-card-hover group p-5"
                  href={`/sources/${source.slug}`}
                  key={source.slug}
                >
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold ring-1 transition group-hover:scale-105 ${source.color}`}
                  >
                    {source.icon}
                  </span>
                  <p className="mt-4 font-semibold text-ink">{source.name}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{source.description}</p>
                  {live && live.docCount > 0 ? (
                    <p className="mt-4 text-xs font-bold text-ocean">
                      {formatNumber(live.docCount)} docs
                    </p>
                  ) : (
                    <p className="mt-4 text-xs text-slate-400">Pending crawl</p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sample queries ------------------------------------------------------ */}
      <section className="section-shell py-16">
        <p className="section-kicker">Shortcuts</p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
          Try a search
        </h2>
        <p className="mt-2 text-slate-500">Jump directly to relevant documentation.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {SAMPLE_QUERIES.map((q) => (
            <Link
              className="chip px-4 py-2 text-sm"
              href={`/search?q=${encodeURIComponent(q)}`}
              key={q}
            >
              {q}
            </Link>
          ))}
        </div>
      </section>

      {/* Architecture credibility -------------------------------------------- */}
      <section className="border-t border-white/80 bg-gradient-to-b from-white/[0.55] to-teal-50/50 py-16">
        <div className="section-shell">
          <p className="section-kicker">Pipeline</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
            How it works
          </h2>
          <p className="mt-2 text-slate-500">
            Four services, one coherent data pipeline from URL to ranked result.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {ARCHITECTURE_POINTS.map((point, i) => (
              <div className="premium-card premium-card-hover p-5" key={point.title}>
                <span className="font-display text-4xl font-bold text-ocean/25">
                  0{i + 1}
                </span>
                <h3 className="mt-3 font-semibold text-ink">{point.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{point.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              className="btn-secondary px-5 py-2.5"
              href="/api/status"
            >
              View live status →
            </Link>
            <Link
              className="btn-secondary px-5 py-2.5"
              href="/insights"
            >
              Search insights →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
