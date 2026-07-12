import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SearchShell } from "@/components/search-shell";

const SOURCES: Record<string, {
  name: string;
  description: string;
  homeUrl: string;
  color: string;
  icon: string;
  topics: string[];
  sampleQueries: string[];
}> = {
  mdn: {
    name: "MDN Web Docs",
    description:
      "The definitive web platform reference maintained by Mozilla. Covers HTML, CSS, JavaScript, browser APIs, accessibility, and web performance.",
    homeUrl: "https://developer.mozilla.org/en-US/docs/Web",
    color: "bg-blue-50 text-blue-700 ring-blue-100",
    icon: "M",
    topics: ["HTML", "CSS", "JavaScript", "Web APIs", "Accessibility", "Performance", "HTTP"],
    sampleQueries: [
      "CSS flexbox",
      "fetch API",
      "Array.prototype.map",
      "Promise.all",
      "Web Workers",
      "CSS grid",
      "querySelector",
    ],
  },
  react: {
    name: "React Docs",
    description:
      "Official React documentation. Covers hooks, component composition, state management patterns, Server Components, and the React rendering model.",
    homeUrl: "https://react.dev/learn",
    color: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    icon: "⚛",
    topics: ["Hooks", "Components", "State", "Effects", "Context", "Server Components", "Refs"],
    sampleQueries: [
      "useState",
      "useEffect",
      "useReducer",
      "Server Components",
      "React context",
      "useMemo",
      "React Suspense",
    ],
  },
  nextjs: {
    name: "Next.js Docs",
    description:
      "Full-stack React framework documentation from Vercel. Covers the App Router, Server Actions, layouts, middleware, API routes, and deployment strategies.",
    homeUrl: "https://nextjs.org/docs",
    color: "bg-stone-50 text-stone-700 ring-stone-200",
    icon: "N",
    topics: ["App Router", "Pages Router", "Server Actions", "Middleware", "API Routes", "Deployment", "Image Optimization"],
    sampleQueries: [
      "App Router",
      "Server Actions",
      "middleware",
      "route handlers",
      "getServerSideProps",
      "Image component",
      "Next.js caching",
    ],
  },
  typescript: {
    name: "TypeScript Handbook",
    description:
      "The official TypeScript language handbook and reference. Covers the type system, generics, utility types, decorators, module resolution, and tsconfig.",
    homeUrl: "https://www.typescriptlang.org/docs/",
    color: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    icon: "TS",
    topics: ["Types", "Interfaces", "Generics", "Utility Types", "Modules", "Decorators", "tsconfig"],
    sampleQueries: [
      "TypeScript generics",
      "utility types",
      "type narrowing",
      "conditional types",
      "mapped types",
      "tsconfig strict",
      "declaration files",
    ],
  },
  postgresql: {
    name: "PostgreSQL Docs",
    description:
      "The complete PostgreSQL database reference. Covers SQL language, built-in functions, data types, indexing, query planner, transactions, and administration.",
    homeUrl: "https://www.postgresql.org/docs/current/",
    color: "bg-teal-50 text-teal-700 ring-teal-100",
    icon: "PG",
    topics: ["SQL", "Indexes", "Functions", "Data Types", "Query Planner", "Transactions", "Administration"],
    sampleQueries: [
      "EXPLAIN ANALYZE",
      "window functions",
      "JSONB operations",
      "CTEs",
      "partial indexes",
      "full-text search",
      "PostgreSQL transactions",
    ],
  },
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const source = SOURCES[slug];
  if (!source) return {};
  return {
    title: source.name,
    description: `Search ${source.name} — ${source.description.split(".")[0]}.`,
  };
}

export default async function SourcePage({ params }: Props) {
  const { slug } = await params;
  const source = SOURCES[slug];
  if (!source) notFound();

  return (
    <main id="main-content" className="page-shell">
      {/* Header */}
      <div className="mb-8 rounded-[2rem] border border-white/70 bg-white/[0.72] p-6 shadow-premium backdrop-blur-xl sm:p-8">
        <Link className="text-sm font-medium text-slate-400 hover:text-ink" href="/sources">
          ← All sources
        </Link>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
          <span
            className={`inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold shadow-soft ring-1 ${source.color}`}
          >
            {source.icon}
          </span>
          <div>
            <p className="section-kicker">Source workspace</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              {source.name}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{source.description}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                className="btn-secondary px-4 py-2 text-xs"
                href={source.homeUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Official site ↗
              </a>
            </div>
          </div>
        </div>

        {/* Topic pills */}
        <div className="mt-5 flex flex-wrap gap-2">
          {source.topics.map((topic) => (
            <Link
              className="chip"
              href={`/search?q=${encodeURIComponent(topic)}&source=${slug}`}
              key={topic}
            >
              {topic}
            </Link>
          ))}
        </div>

        {/* Sample queries */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Popular searches:</span>
          {source.sampleQueries.map((q) => (
            <Link
              className="chip"
              href={`/search?q=${encodeURIComponent(q)}&source=${slug}`}
              key={q}
            >
              {q}
            </Link>
          ))}
        </div>
      </div>

      {/* Scoped search shell */}
      <Suspense
        fallback={
          <div className="premium-card p-8 text-center text-sm text-slate-500">
            Loading search…
          </div>
        }
      >
        <SearchShell initialSource={slug} />
      </Suspense>
    </main>
  );
}
