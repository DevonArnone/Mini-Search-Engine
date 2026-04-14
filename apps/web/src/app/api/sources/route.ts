import { NextResponse } from "next/server";

import { withDb } from "@/lib/db";
import type { SourceInfo, SourcesResponse } from "@mini-search/shared-types";

const DEMO_SOURCES: SourceInfo[] = [
  {
    slug: "mdn",
    name: "MDN Web Docs",
    description: "The definitive web platform reference — HTML, CSS, JavaScript, and browser APIs maintained by Mozilla.",
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
    description: "Official React documentation — hooks, components, and patterns for the library powering millions of UIs.",
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
    description: "Full-stack React framework documentation — App Router, Server Components, routing, and deployment.",
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
    description: "The official TypeScript handbook and language reference — types, generics, utilities, and the compiler.",
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
    description: "Official PostgreSQL documentation — SQL language reference, built-in functions, and administration guides.",
    homeUrl: "https://www.postgresql.org/docs/current/",
    authorityWeight: 8,
    crawlCadenceHours: 720,
    lastCrawledAt: null,
    docCount: 0,
    crawlStatus: "pending",
  },
];

export async function GET() {
  try {
    const sources = await withDb(async (client) => {
      const { rows } = await client.query<{
        slug: string;
        name: string;
        description: string | null;
        home_url: string;
        authority_weight: number;
        crawl_cadence_hours: number;
        last_crawled_at: string | null;
        doc_count: number;
        crawl_status: string;
      }>(
        `SELECT
           sr.slug,
           sr.name,
           sr.description,
           sr.home_url,
           sr.authority_weight,
           sr.crawl_cadence_hours,
           sr.last_crawled_at,
           sr.crawl_status,
           COALESCE(dc.doc_count, 0) AS doc_count
         FROM source_registry sr
         LEFT JOIN (
           SELECT source_slug, COUNT(*) AS doc_count
           FROM documents
           WHERE source_slug IS NOT NULL
           GROUP BY source_slug
         ) dc ON dc.source_slug = sr.slug
         ORDER BY sr.authority_weight DESC, sr.name ASC`,
      );

      return rows.map(
        (row): SourceInfo => ({
          slug: row.slug,
          name: row.name,
          description: row.description ?? "",
          homeUrl: row.home_url,
          authorityWeight: row.authority_weight,
          crawlCadenceHours: row.crawl_cadence_hours,
          lastCrawledAt: row.last_crawled_at,
          docCount: Number(row.doc_count),
          crawlStatus: row.crawl_status as SourceInfo["crawlStatus"],
        }),
      );
    });

    // Merge DB results with the known static list so all sources always appear,
    // even before their first crawl.
    const bySlug = new Map(sources.map((s) => [s.slug, s]));
    const merged = DEMO_SOURCES.map((demo) => bySlug.get(demo.slug) ?? demo);
    // Add any DB sources not in the static list.
    for (const source of sources) {
      if (!merged.find((s) => s.slug === source.slug)) {
        merged.push(source);
      }
    }

    const response: SourcesResponse = { sources: merged };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ sources: DEMO_SOURCES } satisfies SourcesResponse);
  }
}
