import type { SearchResponse, SearchSort } from "@mini-search/shared-types";

import { getDocumentsIndex } from "@/lib/meili";

export interface SearchArgs {
  q: string;
  page: number;
  limit: number;
  domain: string[];
  language: string[];
  tags: string[];
  sort: SearchSort;
  from?: string | null;
  to?: string | null;
}

const demoDocuments = [
  {
    id: "demo-1",
    title: "Mini Search Engine Architecture",
    url: "https://example.com/architecture",
    domain: "example.com",
    meta_description: "System design overview for crawling, parsing, indexing, and retrieval.",
    body: "This document explains the crawler, PostgreSQL metadata storage, Meilisearch ranking, and the Next.js frontend.",
    language: "en",
    tags: ["architecture", "search", "systems"],
    published_at: "2026-03-16T00:00:00Z",
    boost_score: 10,
  },
  {
    id: "demo-2",
    title: "Crawler Pipeline Notes",
    url: "https://example.com/crawler",
    domain: "example.com",
    meta_description: "Seed loading, robots.txt, deduplication, and retry handling.",
    body: "The crawler pulls URLs from PostgreSQL, fetches HTML, extracts content, computes hashes, and indexes batches into Meilisearch.",
    language: "en",
    tags: ["crawler", "etl"],
    published_at: "2026-03-10T00:00:00Z",
    boost_score: 8,
  },
  {
    id: "demo-3",
    title: "Search UX Design",
    url: "https://docs.example.dev/search-ui",
    domain: "docs.example.dev",
    meta_description: "Autocomplete, filters, loading states, and relevance-ranked results.",
    body: "The search UI preserves state in the URL, debounces network calls, and displays highlighted snippets for matching documents.",
    language: "en",
    tags: ["frontend", "ux"],
    published_at: "2026-02-28T00:00:00Z",
    boost_score: 7,
  },
];

function buildFilter(args: SearchArgs) {
  const filters: string[] = [];
  if (args.domain.length) {
    filters.push(`domain IN [${args.domain.map((value) => `"${value}"`).join(", ")}]`);
  }
  if (args.language.length) {
    filters.push(
      `language IN [${args.language.map((value) => `"${value}"`).join(", ")}]`,
    );
  }
  if (args.tags.length) {
    filters.push(`tags IN [${args.tags.map((value) => `"${value}"`).join(", ")}]`);
  }
  if (args.from) {
    filters.push(`published_at >= ${JSON.stringify(args.from)}`);
  }
  if (args.to) {
    filters.push(`published_at <= ${JSON.stringify(args.to)}`);
  }
  return filters.length ? filters.join(" AND ") : undefined;
}

function buildSort(sort: SearchSort) {
  if (sort === "newest") {
    return ["published_at:desc"];
  }
  if (sort === "oldest") {
    return ["published_at:asc"];
  }
  return ["boost_score:desc"];
}

function runDemoSearch(args: SearchArgs): SearchResponse {
  const q = args.q.trim().toLowerCase();
  let filtered = demoDocuments.filter((document) => {
    const matchesQuery =
      !q ||
      [document.title, document.meta_description, document.body, ...document.tags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    const matchesDomain = !args.domain.length || args.domain.includes(document.domain);
    const matchesLanguage =
      !args.language.length || args.language.includes(document.language ?? "");
    const matchesTags =
      !args.tags.length || args.tags.some((tag) => document.tags.includes(tag));
    return matchesQuery && matchesDomain && matchesLanguage && matchesTags;
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
    results: pageItems.map((document) => ({
      id: document.id,
      title: document.title,
      url: document.url,
      domain: document.domain,
      snippet: document.meta_description,
      highlights: [document.title],
      publishedAt: document.published_at,
      language: document.language,
      tags: document.tags,
    })),
  };
}

export async function runSearch(args: SearchArgs): Promise<SearchResponse> {
  try {
    const index = getDocumentsIndex();
    const response = await index.search(args.q, {
      limit: args.limit,
      offset: (args.page - 1) * args.limit,
      filter: buildFilter(args),
      sort: buildSort(args.sort),
      attributesToHighlight: ["title", "meta_description", "body"],
      attributesToCrop: ["body"],
      cropLength: 30,
    });

    return {
      query: args.q,
      page: args.page,
      limit: args.limit,
      totalHits: response.estimatedTotalHits ?? 0,
      processingTimeMs: response.processingTimeMs,
      results: response.hits.map((hit) => {
        const formatted = hit._formatted as Record<string, string> | undefined;
        return {
          id: String(hit.id),
          title: String(hit.title ?? "Untitled"),
          url: String(hit.url ?? ""),
          domain: String(hit.domain ?? ""),
          snippet: String(formatted?.body ?? hit.meta_description ?? ""),
          highlights: [
            String(formatted?.title ?? hit.title ?? ""),
            String(formatted?.meta_description ?? hit.meta_description ?? ""),
          ].filter(Boolean),
          publishedAt: (hit.published_at as string | null | undefined) ?? null,
          language: (hit.language as string | null | undefined) ?? null,
          tags: Array.isArray(hit.tags) ? (hit.tags as string[]) : [],
        };
      }),
    };
  } catch {
    return runDemoSearch(args);
  }
}

export async function runAutocomplete(q: string) {
  if (!q) {
    return [];
  }
  try {
    const response = await getDocumentsIndex().search(q, {
      limit: 5,
      attributesToRetrieve: ["title"],
    });
    return response.hits
      .map((hit) => String(hit.title ?? "").trim())
      .filter(Boolean);
  } catch {
    return demoDocuments
      .map((document) => document.title)
      .filter((title) => title.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5);
  }
}

export async function runFilterQuery() {
  try {
    const response = await getDocumentsIndex().search("", {
      limit: 0,
      facets: ["domain", "language", "tags"],
    });
    return {
      domains: Object.entries(response.facetDistribution?.domain ?? {}).map(
        ([value, count]) => ({ value, count }),
      ),
      languages: Object.entries(response.facetDistribution?.language ?? {}).map(
        ([value, count]) => ({ value, count }),
      ),
      tags: Object.entries(response.facetDistribution?.tags ?? {}).map(([value, count]) => ({
        value,
        count,
      })),
      dateBuckets: [],
    };
  } catch {
    const count = (values: string[]) =>
      Array.from(new Set(values)).map((value) => ({
        value,
        count: values.filter((item) => item === value).length,
      }));
    return {
      domains: count(demoDocuments.map((document) => document.domain)),
      languages: count(demoDocuments.map((document) => document.language)),
      tags: count(demoDocuments.flatMap((document) => document.tags)),
      dateBuckets: [],
    };
  }
}
