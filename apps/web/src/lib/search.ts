import type {
  ContentType,
  FiltersResponse,
  SearchResponse,
  SearchResult,
  SearchSort,
} from "@mini-search/shared-types";

import { getDocumentsIndex } from "@/lib/meili";

export interface SearchArgs {
  q: string;
  page: number;
  limit: number;
  source: string[];
  contentType: ContentType[];
  domain: string[];
  language: string[];
  tags: string[];
  sort: SearchSort;
  from?: string | null;
  to?: string | null;
  updatedWithin?: string | null;
}

// ---------------------------------------------------------------------------
// Demo fallback data (shown when Meilisearch is unavailable)
// ---------------------------------------------------------------------------

const demoDocuments = [
  {
    id: "demo-1",
    title: "useState – React Reference",
    url: "https://react.dev/reference/react/useState",
    domain: "react.dev",
    source_slug: "react",
    source_name: "React Docs",
    content_type: "reference" as ContentType,
    section_path: "Reference > React > Hooks",
    meta_description: "useState is a React Hook that lets you add a state variable to your component.",
    body: "useState is a React Hook that lets you add a state variable to your component. Call useState at the top level of your component to declare a state variable.",
    language: "en",
    tags: ["hooks", "state"],
    published_at: "2024-01-15T00:00:00Z",
    last_updated_at: "2024-11-20T00:00:00Z",
    word_count: 1200,
    code_block_count: 8,
    boost_score: 12,
    authority_score: 9,
    freshness_status: "fresh",
  },
  {
    id: "demo-2",
    title: "Array Methods – MDN Web Docs",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
    domain: "developer.mozilla.org",
    source_slug: "mdn",
    source_name: "MDN Web Docs",
    content_type: "reference" as ContentType,
    section_path: "JavaScript > Standard built-in objects > Array",
    meta_description: "The Array object enables storing a collection of multiple items under a single variable name.",
    body: "The Array object, as with arrays in other programming languages, enables storing a collection of multiple items under a single variable name, and has members for performing common array operations.",
    language: "en",
    tags: ["javascript", "arrays"],
    published_at: "2023-06-10T00:00:00Z",
    last_updated_at: "2024-10-05T00:00:00Z",
    word_count: 3500,
    code_block_count: 12,
    boost_score: 14,
    authority_score: 10,
    freshness_status: "fresh",
  },
  {
    id: "demo-3",
    title: "App Router – Next.js Docs",
    url: "https://nextjs.org/docs/app",
    domain: "nextjs.org",
    source_slug: "nextjs",
    source_name: "Next.js Docs",
    content_type: "guide" as ContentType,
    section_path: "Docs > App Router",
    meta_description: "The App Router is a new paradigm for building applications using React's latest features.",
    body: "Next.js App Router uses Server Components and layouts to compose UIs across multiple pages without extra client-side JavaScript.",
    language: "en",
    tags: ["routing", "react-server-components"],
    published_at: "2023-05-04T00:00:00Z",
    last_updated_at: "2024-09-18T00:00:00Z",
    word_count: 900,
    code_block_count: 5,
    boost_score: 11,
    authority_score: 9,
    freshness_status: "fresh",
  },
];

// ---------------------------------------------------------------------------
// Filter / sort builders
// ---------------------------------------------------------------------------

function updatedWithinFilter(updatedWithin: string): string | null {
  const now = new Date();
  const days = { "7d": 7, "30d": 30, "90d": 90 }[updatedWithin];
  if (!days) return null;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  return `last_updated_at >= "${cutoff.toISOString()}"`;
}

function buildFilter(args: SearchArgs): string | undefined {
  const filters: string[] = [];

  if (args.source.length) {
    filters.push(`source_slug IN [${args.source.map((v) => `"${v}"`).join(", ")}]`);
  }
  if (args.contentType.length) {
    filters.push(`content_type IN [${args.contentType.map((v) => `"${v}"`).join(", ")}]`);
  }
  if (args.domain.length) {
    filters.push(`domain IN [${args.domain.map((v) => `"${v}"`).join(", ")}]`);
  }
  if (args.language.length) {
    filters.push(`language IN [${args.language.map((v) => `"${v}"`).join(", ")}]`);
  }
  if (args.tags.length) {
    filters.push(`tags IN [${args.tags.map((v) => `"${v}"`).join(", ")}]`);
  }
  if (args.from) {
    filters.push(`published_at >= ${JSON.stringify(args.from)}`);
  }
  if (args.to) {
    filters.push(`published_at <= ${JSON.stringify(args.to)}`);
  }
  if (args.updatedWithin) {
    const f = updatedWithinFilter(args.updatedWithin);
    if (f) filters.push(f);
  }

  return filters.length ? filters.join(" AND ") : undefined;
}

function buildSort(sort: SearchSort): string[] {
  if (sort === "newest") return ["published_at:desc", "authority_score:desc"];
  if (sort === "oldest") return ["published_at:asc"];
  // relevance: Meilisearch's text relevance is primary (via rankingRules),
  // but for the explicit sort= clause we still push authority and boost.
  return ["authority_score:desc", "boost_score:desc"];
}

// ---------------------------------------------------------------------------
// whyMatched derivation from Meilisearch _formatted highlights
// ---------------------------------------------------------------------------

const EM_RE = /<em>/;
const FIELD_LABELS: Record<string, string> = {
  title: "title",
  headings: "headings",
  section_path: "section",
  meta_description: "description",
  body: "body",
  source_name: "source",
};

function deriveWhyMatched(formatted: Record<string, unknown> | undefined): string[] {
  if (!formatted) return [];
  return Object.entries(FIELD_LABELS)
    .filter(([field]) => {
      const value = formatted[field];
      if (!value) return false;
      const text = Array.isArray(value) ? value.join(" ") : String(value);
      return EM_RE.test(text);
    })
    .map(([, label]) => label);
}

// ---------------------------------------------------------------------------
// Recovery suggestions for zero-result queries
// ---------------------------------------------------------------------------

const RECOVERY_SUGGESTIONS: Record<string, string[]> = {
  react: ["useState", "useEffect", "Server Components", "React hooks", "JSX"],
  next: ["App Router", "Server Components", "API routes", "getServerSideProps", "middleware"],
  typescript: ["generics", "utility types", "type narrowing", "decorators", "tsconfig"],
  postgres: ["SELECT", "JOIN", "indexes", "EXPLAIN ANALYZE", "transactions"],
  mdn: ["fetch API", "CSS grid", "Array methods", "Promise", "Web APIs"],
  javascript: ["closures", "async await", "destructuring", "modules", "prototype"],
  css: ["flexbox", "grid", "custom properties", "animations", "selectors"],
  html: ["semantic HTML", "accessibility", "forms", "canvas", "Web components"],
};

function buildRecoverySuggestions(q: string): string[] {
  if (!q) return [];
  const lower = q.toLowerCase();
  for (const [keyword, suggestions] of Object.entries(RECOVERY_SUGGESTIONS)) {
    if (lower.includes(keyword)) {
      return suggestions.slice(0, 4);
    }
  }
  return ["useState", "async/await", "SQL joins", "TypeScript generics", "CSS flexbox"].slice(0, 4);
}

// ---------------------------------------------------------------------------
// Demo search
// ---------------------------------------------------------------------------

function runDemoSearch(args: SearchArgs): SearchResponse {
  const q = args.q.trim().toLowerCase();
  let filtered = demoDocuments.filter((doc) => {
    const text = [doc.title, doc.meta_description, doc.body, ...doc.tags].join(" ").toLowerCase();
    const matchesQuery = !q || text.includes(q);
    const matchesSource = !args.source.length || args.source.includes(doc.source_slug);
    const matchesContentType = !args.contentType.length || args.contentType.includes(doc.content_type);
    const matchesDomain = !args.domain.length || args.domain.includes(doc.domain);
    const matchesLanguage = !args.language.length || args.language.includes(doc.language ?? "");
    const matchesTags = !args.tags.length || args.tags.some((tag) => doc.tags.includes(tag));
    return matchesQuery && matchesSource && matchesContentType && matchesDomain && matchesLanguage && matchesTags;
  });

  if (args.sort === "newest") {
    filtered = [...filtered].sort((a, b) => b.published_at.localeCompare(a.published_at));
  } else if (args.sort === "oldest") {
    filtered = [...filtered].sort((a, b) => a.published_at.localeCompare(b.published_at));
  } else {
    filtered = [...filtered].sort((a, b) => b.boost_score - a.boost_score);
  }

  const start = (args.page - 1) * args.limit;
  const pageItems = filtered.slice(start, start + args.limit);

  return {
    query: args.q,
    page: args.page,
    limit: args.limit,
    totalHits: filtered.length,
    processingTimeMs: 12,
    mode: "demo",
    warning: "Showing bundled demo results because Meilisearch is unavailable.",
    recoverySuggestions: filtered.length === 0 ? buildRecoverySuggestions(args.q) : undefined,
    results: pageItems.map((doc) => ({
      id: doc.id,
      title: doc.title,
      url: doc.url,
      domain: doc.domain,
      sourceSlug: doc.source_slug,
      sourceName: doc.source_name,
      contentType: doc.content_type,
      sectionPath: doc.section_path,
      snippet: doc.meta_description,
      highlights: [doc.title],
      publishedAt: doc.published_at,
      lastUpdatedAt: doc.last_updated_at,
      language: doc.language,
      tags: doc.tags,
      codeBlockCount: doc.code_block_count,
      freshnessStatus: doc.freshness_status as SearchResult["freshnessStatus"],
      whyMatched: [],
    })),
  };
}

// ---------------------------------------------------------------------------
// Live search
// ---------------------------------------------------------------------------

export async function runSearch(args: SearchArgs): Promise<SearchResponse> {
  try {
    const index = getDocumentsIndex();
    const response = await index.search(args.q, {
      limit: args.limit,
      offset: (args.page - 1) * args.limit,
      filter: buildFilter(args),
      sort: buildSort(args.sort),
      attributesToHighlight: ["title", "headings", "section_path", "meta_description", "body"],
      attributesToCrop: ["body"],
      cropLength: 35,
      facets: ["source_slug", "content_type"],
    });

    const results: SearchResult[] = response.hits.map((hit) => {
      const formatted = hit._formatted as Record<string, unknown> | undefined;
      const snippet = String(
        (formatted?.body as string | undefined) ??
        hit.meta_description ??
        "",
      );
      return {
        id: String(hit.id),
        title: String(hit.title ?? "Untitled"),
        url: String(hit.url ?? ""),
        domain: String(hit.domain ?? ""),
        sourceSlug: (hit.source_slug as string | null | undefined) ?? null,
        sourceName: (hit.source_name as string | null | undefined) ?? null,
        contentType: (hit.content_type as ContentType | null | undefined) ?? null,
        sectionPath: (hit.section_path as string | null | undefined) ?? null,
        snippet,
        highlights: [
          String((formatted?.title as string | undefined) ?? hit.title ?? ""),
          String((formatted?.meta_description as string | undefined) ?? hit.meta_description ?? ""),
        ].filter(Boolean),
        publishedAt: (hit.published_at as string | null | undefined) ?? null,
        lastUpdatedAt: (hit.last_updated_at as string | null | undefined) ?? null,
        language: (hit.language as string | null | undefined) ?? null,
        tags: Array.isArray(hit.tags) ? (hit.tags as string[]) : [],
        codeBlockCount: (hit.code_block_count as number | undefined) ?? 0,
        freshnessStatus: ((hit.freshness_status as string | undefined) ?? "unknown") as SearchResult["freshnessStatus"],
        whyMatched: deriveWhyMatched(formatted),
      };
    });

    const totalHits = response.estimatedTotalHits ?? 0;

    return {
      query: args.q,
      page: args.page,
      limit: args.limit,
      totalHits,
      processingTimeMs: response.processingTimeMs,
      mode: "live",
      recoverySuggestions: totalHits === 0 && args.q ? buildRecoverySuggestions(args.q) : undefined,
      results,
    };
  } catch {
    return runDemoSearch(args);
  }
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export async function runAutocomplete(q: string) {
  if (!q) return [];
  try {
    const response = await getDocumentsIndex().search(q, {
      limit: 8,
      attributesToRetrieve: ["title", "source_name", "content_type"],
    });
    return Array.from(
      new Set(
        response.hits
          .map((hit) => String(hit.title ?? "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 6);
  } catch {
    return Array.from(
      new Set(
        demoDocuments
          .map((doc) => doc.title)
          .filter((title) => title.toLowerCase().includes(q.toLowerCase())),
      ),
    ).slice(0, 6);
  }
}

// ---------------------------------------------------------------------------
// Filter facets
// ---------------------------------------------------------------------------

export async function runFilterQuery(): Promise<FiltersResponse> {
  try {
    const response = await getDocumentsIndex().search("", {
      limit: 0,
      facets: ["source_slug", "content_type", "domain", "language", "tags"],
    });
    const dist = response.facetDistribution ?? {};
    return {
      sources: Object.entries(dist.source_slug ?? {}).map(([value, count]) => ({ value, count })),
      contentTypes: Object.entries(dist.content_type ?? {}).map(([value, count]) => ({ value, count })),
      domains: Object.entries(dist.domain ?? {}).map(([value, count]) => ({ value, count })),
      languages: Object.entries(dist.language ?? {}).map(([value, count]) => ({ value, count })),
      tags: Object.entries(dist.tags ?? {}).map(([value, count]) => ({ value, count })),
      dateBuckets: [],
    };
  } catch {
    const count = (values: string[]) =>
      Array.from(new Set(values)).map((value) => ({
        value,
        count: values.filter((item) => item === value).length,
      }));
    return {
      sources: count(demoDocuments.map((doc) => doc.source_slug)),
      contentTypes: count(demoDocuments.map((doc) => doc.content_type)),
      domains: count(demoDocuments.map((doc) => doc.domain)),
      languages: count(demoDocuments.map((doc) => doc.language)),
      tags: count(demoDocuments.flatMap((doc) => doc.tags)),
      dateBuckets: [],
    };
  }
}
