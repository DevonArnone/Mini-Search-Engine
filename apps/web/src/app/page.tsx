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
    <main>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-20 lg:pt-28">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-ocean">
          Developer Documentation Search
        </p>
        <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold tracking-tight text-ink md:text-7xl">
          Find the docs you need,{" "}
          <span className="text-ocean">instantly.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
          A unified full-text search across MDN, React, Next.js, TypeScript, and PostgreSQL
          official documentation — powered by a real crawl, index, and ranking stack.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            href="/search"
          >
            Search Documentation
            <span aria-hidden>→</span>
          </Link>
          <Link
            className="inline-flex rounded-full border border-orange-200 bg-white/80 px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-orange-50"
            href="/sources"
          >
            Browse Sources
          </Link>
        </div>

        {/* Stats row */}
        <div className="mt-14 flex flex-wrap gap-8 border-t border-orange-100 pt-8">
          <div>
            <p className="font-display text-3xl font-semibold text-ink">
              {totalDocs > 0 ? formatNumber(totalDocs) : "—"}
            </p>
            <p className="mt-1 text-sm text-stone-500">documents indexed</p>
          </div>
          <div>
            <p className="font-display text-3xl font-semibold text-ink">
              {SOURCES.length}
            </p>
            <p className="mt-1 text-sm text-stone-500">curated sources</p>
          </div>
          <div>
            <p className="font-display text-3xl font-semibold text-ink">
              {liveSources > 0 ? liveSources : SOURCES.length}
            </p>
            <p className="mt-1 text-sm text-stone-500">sources indexed</p>
          </div>
          <div>
            <p className="font-display text-3xl font-semibold text-ocean">
              {status.mode === "live" ? "Live" : "Demo"}
            </p>
            <p className="mt-1 text-sm text-stone-500">index status</p>
          </div>
        </div>
      </section>

      {/* Source coverage ----------------------------------------------------- */}
      <section className="border-y border-orange-100 bg-white/50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Indexed sources</h2>
          <p className="mt-2 text-stone-500">
            Five authoritative documentation sites, crawled on a regular schedule.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {SOURCES.map((source) => {
              const live = status.sources.find((s) => s.slug === source.slug);
              return (
                <Link
                  className="group rounded-2xl border border-orange-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  href={`/sources/${source.slug}`}
                  key={source.slug}
                >
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ring-1 ${source.color}`}
                  >
                    {source.icon}
                  </span>
                  <p className="mt-3 font-semibold text-ink">{source.name}</p>
                  <p className="mt-1 text-xs text-stone-500">{source.description}</p>
                  {live && live.docCount > 0 ? (
                    <p className="mt-3 text-xs font-medium text-ocean">
                      {formatNumber(live.docCount)} docs
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-stone-400">Pending crawl</p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sample queries ------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-semibold text-ink">Try a search</h2>
        <p className="mt-2 text-stone-500">Jump directly to relevant documentation.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {SAMPLE_QUERIES.map((q) => (
            <Link
              className="rounded-full border border-orange-200 bg-white/80 px-4 py-2 text-sm text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50"
              href={`/search?q=${encodeURIComponent(q)}`}
              key={q}
            >
              {q}
            </Link>
          ))}
        </div>
      </section>

      {/* Architecture credibility -------------------------------------------- */}
      <section className="border-t border-orange-100 bg-white/50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl font-semibold text-ink">How it works</h2>
          <p className="mt-2 text-stone-500">
            Four services, one coherent data pipeline from URL to ranked result.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {ARCHITECTURE_POINTS.map((point, i) => (
              <div className="rounded-2xl border border-orange-100 bg-white p-5" key={point.title}>
                <span className="font-display text-3xl font-semibold text-ocean opacity-30">
                  0{i + 1}
                </span>
                <h3 className="mt-3 font-semibold text-ink">{point.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">{point.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-4">
            <Link
              className="text-sm font-medium text-ocean hover:underline"
              href="/api/status"
            >
              View live status →
            </Link>
            <Link
              className="text-sm font-medium text-ocean hover:underline"
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
