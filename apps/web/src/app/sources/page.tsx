import type { Metadata } from "next";
import Link from "next/link";

import type { SourceInfo } from "@mini-search/shared-types";

export const metadata: Metadata = {
  title: "Sources",
  description: "Browse the five curated documentation sources indexed by DevDocs Search.",
};

const STATIC_SOURCES: SourceInfo[] = [
  {
    slug: "mdn",
    name: "MDN Web Docs",
    description:
      "The definitive web platform reference — HTML, CSS, JavaScript APIs, and browser behaviour — maintained by Mozilla and the community.",
    homeUrl: "https://developer.mozilla.org/en-US/docs/Web",
    authorityWeight: 10,
    crawlCadenceHours: 168,
    lastCrawledAt: null,
    docCount: 0,
    crawlStatus: "pending",
  },
  {
    slug: "react",
    name: "React Docs",
    description:
      "Official React documentation covering hooks, components, Server Components, and the patterns behind the world's most popular UI library.",
    homeUrl: "https://react.dev/learn",
    authorityWeight: 9,
    crawlCadenceHours: 168,
    lastCrawledAt: null,
    docCount: 0,
    crawlStatus: "pending",
  },
  {
    slug: "nextjs",
    name: "Next.js Docs",
    description:
      "Full-stack React framework documentation covering the App Router, layouts, Server Actions, API routes, middleware, and deployment.",
    homeUrl: "https://nextjs.org/docs",
    authorityWeight: 9,
    crawlCadenceHours: 168,
    lastCrawledAt: null,
    docCount: 0,
    crawlStatus: "pending",
  },
  {
    slug: "typescript",
    name: "TypeScript Handbook",
    description:
      "The official TypeScript handbook and language reference — types, interfaces, generics, utility types, decorators, and tsconfig options.",
    homeUrl: "https://www.typescriptlang.org/docs/",
    authorityWeight: 9,
    crawlCadenceHours: 336,
    lastCrawledAt: null,
    docCount: 0,
    crawlStatus: "pending",
  },
  {
    slug: "postgresql",
    name: "PostgreSQL Docs",
    description:
      "The complete PostgreSQL reference — SQL language, built-in functions, data types, indexing, query planner, and administration guides.",
    homeUrl: "https://www.postgresql.org/docs/current/",
    authorityWeight: 8,
    crawlCadenceHours: 720,
    lastCrawledAt: null,
    docCount: 0,
    crawlStatus: "pending",
  },
];

const SOURCE_ICONS: Record<string, string> = {
  mdn: "M",
  react: "⚛",
  nextjs: "N",
  typescript: "TS",
  postgresql: "PG",
};

const SOURCE_COLORS: Record<string, string> = {
  mdn: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  react: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100",
  nextjs: "bg-stone-50 text-stone-700 ring-1 ring-stone-200",
  typescript: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  postgresql: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
};

const SAMPLE_QUERIES: Record<string, string[]> = {
  mdn: ["CSS grid layout", "fetch API", "Array methods", "Promise", "Web components"],
  react: ["useState", "useEffect", "Server Components", "React hooks", "context API"],
  nextjs: ["App Router", "Server Actions", "middleware", "route handlers", "Image component"],
  typescript: ["generics", "utility types", "type narrowing", "interfaces vs types", "decorators"],
  postgresql: ["EXPLAIN ANALYZE", "window functions", "JSONB", "indexes", "CTEs"],
};

function crawlStatusBadge(status: SourceInfo["crawlStatus"]) {
  const map = {
    healthy: "bg-emerald-50 text-emerald-700",
    crawling: "bg-blue-50 text-blue-700",
    failing: "bg-rose-50 text-rose-700",
    pending: "bg-stone-50 text-stone-500",
  };
  const labels = { healthy: "Healthy", crawling: "Crawling", failing: "Failing", pending: "Pending" };
  return { color: map[status] ?? map.pending, label: labels[status] ?? status };
}

async function getSources(): Promise<SourceInfo[]> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/sources`, { next: { revalidate: 60 } });
    if (!res.ok) return STATIC_SOURCES;
    const data = await res.json() as { sources: SourceInfo[] };
    // Merge DB data with static list so descriptions always appear
    const bySlug = new Map(data.sources.map((s) => [s.slug, s]));
    return STATIC_SOURCES.map((s) => ({
      ...s,
      ...bySlug.get(s.slug),
      description: s.description, // always use the richer static description
    }));
  } catch {
    return STATIC_SOURCES;
  }
}

export default async function SourcesPage() {
  const sources = await getSources();
  const totalDocs = sources.reduce((acc, s) => acc + s.docCount, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-ocean">Browse</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
          Documentation sources
        </h1>
        <p className="mt-3 max-w-2xl text-stone-500">
          {totalDocs > 0
            ? `${totalDocs.toLocaleString()} pages crawled and indexed across ${sources.length} official documentation sites.`
            : `${sources.length} curated documentation sources, crawled on a regular schedule.`}
        </p>
      </div>

      <div className="space-y-6">
        {sources.map((source) => {
          const icon = SOURCE_ICONS[source.slug] ?? source.slug[0].toUpperCase();
          const iconColor = SOURCE_COLORS[source.slug] ?? "bg-orange-50 text-orange-700 ring-1 ring-orange-100";
          const badge = crawlStatusBadge(source.crawlStatus);
          const queries = SAMPLE_QUERIES[source.slug] ?? [];

          return (
            <article
              className="rounded-3xl border border-orange-200 bg-white/85 p-6 shadow-sm"
              key={source.slug}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <span
                    className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${iconColor}`}
                  >
                    {icon}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-semibold text-ink">{source.name}</h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">{source.description}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-400">
                      {source.docCount > 0 ? (
                        <span>{source.docCount.toLocaleString()} pages indexed</span>
                      ) : null}
                      {source.lastCrawledAt ? (
                        <span>
                          Last crawled{" "}
                          {new Date(source.lastCrawledAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      ) : null}
                      <span>Crawled every {source.crawlCadenceHours >= 720
                        ? `${Math.round(source.crawlCadenceHours / 720)} month${source.crawlCadenceHours >= 1440 ? "s" : ""}`
                        : source.crawlCadenceHours >= 168
                        ? `${Math.round(source.crawlCadenceHours / 168)} week${source.crawlCadenceHours >= 336 ? "s" : ""}`
                        : `${source.crawlCadenceHours}h`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-3">
                  <Link
                    className="rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-orange-50"
                    href={`/sources/${source.slug}`}
                  >
                    Browse source
                  </Link>
                  <a
                    className="rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-orange-50"
                    href={source.homeUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Official site ↗
                  </a>
                </div>
              </div>

              {/* Sample queries */}
              {queries.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="text-xs text-stone-400">Try:</span>
                  {queries.map((q) => (
                    <Link
                      className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-700 transition-colors hover:bg-orange-100"
                      href={`/search?q=${encodeURIComponent(q)}&source=${source.slug}`}
                      key={q}
                    >
                      {q}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}
