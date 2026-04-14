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
    <main className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link className="text-sm text-stone-400 hover:text-ink" href="/sources">
          ← All sources
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <span
            className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold ring-1 ${source.color}`}
          >
            {source.icon}
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
              {source.name}
            </h1>
            <p className="mt-2 max-w-2xl text-stone-500">{source.description}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs text-stone-600 hover:bg-orange-50"
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
              className="rounded-full border border-orange-100 bg-white px-3 py-1 text-xs text-stone-600 transition-colors hover:bg-orange-50"
              href={`/search?q=${encodeURIComponent(topic)}&source=${slug}`}
              key={topic}
            >
              {topic}
            </Link>
          ))}
        </div>

        {/* Sample queries */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-400">Popular searches:</span>
          {source.sampleQueries.map((q) => (
            <Link
              className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-700 transition-colors hover:bg-orange-100"
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
          <div className="rounded-3xl border border-orange-200 bg-white/80 p-8 text-center text-sm text-stone-500">
            Loading search…
          </div>
        }
      >
        <SearchShell initialSource={slug} />
      </Suspense>
    </main>
  );
}
