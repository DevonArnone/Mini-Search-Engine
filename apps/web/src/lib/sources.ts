import type { SourceInfo } from "@mini-search/shared-types";

export interface SourceDefinition extends Omit<SourceInfo, "lastCrawledAt" | "docCount" | "crawlStatus"> {
  shortName: string;
  mark: string;
  topics: string[];
  sampleQueries: string[];
}

export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    slug: "mdn",
    name: "MDN Web Docs",
    shortName: "MDN",
    mark: "M",
    description: "Web platform reference for HTML, CSS, JavaScript, browser APIs, accessibility, and performance.",
    homeUrl: "https://developer.mozilla.org/en-US/docs/Web",
    authorityWeight: 10,
    crawlCadenceHours: 168,
    topics: ["HTML", "CSS", "JavaScript", "Web APIs", "Accessibility", "HTTP"],
    sampleQueries: ["CSS grid", "fetch API", "Array methods", "Promise", "Web components"],
  },
  {
    slug: "react",
    name: "React Docs",
    shortName: "React",
    mark: "R",
    description: "Official guidance for components, hooks, state, effects, context, and React's rendering model.",
    homeUrl: "https://react.dev/learn",
    authorityWeight: 9,
    crawlCadenceHours: 168,
    topics: ["Hooks", "Components", "State", "Effects", "Context", "Server Components"],
    sampleQueries: ["useState", "useEffect", "Server Components", "React hooks", "context API"],
  },
  {
    slug: "nextjs",
    name: "Next.js Docs",
    shortName: "Next.js",
    mark: "N",
    description: "Framework documentation for the App Router, Server Actions, routing, caching, and deployment.",
    homeUrl: "https://nextjs.org/docs",
    authorityWeight: 9,
    crawlCadenceHours: 168,
    topics: ["App Router", "Server Actions", "Routing", "Caching", "Middleware", "Deployment"],
    sampleQueries: ["App Router", "Server Actions", "middleware", "route handlers", "caching"],
  },
  {
    slug: "typescript",
    name: "TypeScript Handbook",
    shortName: "TypeScript",
    mark: "TS",
    description: "Language handbook and reference for types, generics, utility types, modules, and compiler options.",
    homeUrl: "https://www.typescriptlang.org/docs/",
    authorityWeight: 9,
    crawlCadenceHours: 336,
    topics: ["Types", "Interfaces", "Generics", "Utility Types", "Modules", "tsconfig"],
    sampleQueries: ["generics", "utility types", "type narrowing", "conditional types", "tsconfig strict"],
  },
  {
    slug: "postgresql",
    name: "PostgreSQL Docs",
    shortName: "PostgreSQL",
    mark: "PG",
    description: "Database reference for SQL, functions, data types, indexes, planning, and administration.",
    homeUrl: "https://www.postgresql.org/docs/current/",
    authorityWeight: 8,
    crawlCadenceHours: 720,
    topics: ["SQL", "Indexes", "Functions", "Data Types", "Query Planning", "Administration"],
    sampleQueries: ["EXPLAIN ANALYZE", "window functions", "JSONB", "indexes", "CTEs"],
  },
];

export const SOURCE_BY_SLUG = new Map(SOURCE_DEFINITIONS.map((source) => [source.slug, source]));

export function getFallbackSources(): SourceInfo[] {
  return SOURCE_DEFINITIONS.map((source) => ({
    ...source,
    lastCrawledAt: null,
    docCount: 0,
    crawlStatus: "pending",
  }));
}
