import type { SourceInfo, StatusResponse } from "@mini-search/shared-types";

import { withDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getDocumentsIndex } from "@/lib/meili";

const DEMO_SOURCES: SourceInfo[] = [
  { slug: "mdn", name: "MDN Web Docs", description: "", homeUrl: "https://developer.mozilla.org/en-US/docs/Web", authorityWeight: 10, crawlCadenceHours: 168, lastCrawledAt: null, docCount: 0, crawlStatus: "pending" },
  { slug: "react", name: "React Docs", description: "", homeUrl: "https://react.dev/learn", authorityWeight: 9, crawlCadenceHours: 168, lastCrawledAt: null, docCount: 0, crawlStatus: "pending" },
  { slug: "nextjs", name: "Next.js Docs", description: "", homeUrl: "https://nextjs.org/docs", authorityWeight: 9, crawlCadenceHours: 168, lastCrawledAt: null, docCount: 0, crawlStatus: "pending" },
  { slug: "typescript", name: "TypeScript Handbook", description: "", homeUrl: "https://www.typescriptlang.org/docs/", authorityWeight: 9, crawlCadenceHours: 336, lastCrawledAt: null, docCount: 0, crawlStatus: "pending" },
  { slug: "postgresql", name: "PostgreSQL Docs", description: "", homeUrl: "https://www.postgresql.org/docs/current/", authorityWeight: 8, crawlCadenceHours: 720, lastCrawledAt: null, docCount: 0, crawlStatus: "pending" },
];

const demoStatus: StatusResponse = {
  mode: "demo",
  indexedDocuments: 0,
  queuedDocuments: 0,
  crawlFailures: 0,
  analyticsEvents: 0,
  duplicateDocuments: 0,
  duplicateGroups: 0,
  topDomains: [],
  sources: DEMO_SOURCES,
  searchEngine: { healthy: false, indexUid: "documents" },
  database: { healthy: false },
  generatedAt: new Date().toISOString(),
};

export async function getStatus(): Promise<StatusResponse> {
  try {
    const [dbStatus, meiliStatus] = await Promise.all([
      withDb(async (client) => {
        const [
          { rows: documentRows },
          { rows: queueRows },
          { rows: logRows },
          { rows: analyticsRows },
          { rows: duplicateRows },
          { rows: domainRows },
          { rows: sourceRows },
        ] = await Promise.all([
          client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM documents"),
          client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM crawl_queue WHERE status IN ('pending', 'processing')",
          ),
          client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM crawl_logs WHERE error_message IS NOT NULL OR status_code >= 400",
          ),
          client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM search_analytics",
          ),
          client.query<{ duplicate_documents: string; duplicate_groups: string }>(
            `SELECT
               COALESCE(SUM(group_count) - COUNT(*), 0)::text AS duplicate_documents,
               COUNT(*)::text AS duplicate_groups
             FROM (
               SELECT COUNT(*) AS group_count FROM documents GROUP BY content_hash HAVING COUNT(*) > 1
             ) t`,
          ),
          client.query<{ domain: string; count: string }>(
            `SELECT domain, COUNT(*)::text AS count
             FROM documents
             GROUP BY domain ORDER BY COUNT(*) DESC, domain ASC LIMIT 5`,
          ),
          client.query<{
            slug: string; name: string; description: string | null;
            home_url: string; authority_weight: number; crawl_cadence_hours: number;
            last_crawled_at: string | null; doc_count: string; crawl_status: string;
          }>(
            `SELECT sr.slug, sr.name, sr.description, sr.home_url,
                    sr.authority_weight, sr.crawl_cadence_hours,
                    sr.last_crawled_at, sr.crawl_status,
                    COALESCE(dc.doc_count, 0)::text AS doc_count
             FROM source_registry sr
             LEFT JOIN (
               SELECT source_slug, COUNT(*) AS doc_count
               FROM documents WHERE source_slug IS NOT NULL GROUP BY source_slug
             ) dc ON dc.source_slug = sr.slug
             ORDER BY sr.authority_weight DESC`,
          ),
        ]);

        // Merge live DB source data with static known list
        const bySlug = new Map(
          sourceRows.map((r) => [
            r.slug,
            {
              slug: r.slug,
              name: r.name,
              description: r.description ?? "",
              homeUrl: r.home_url,
              authorityWeight: r.authority_weight,
              crawlCadenceHours: r.crawl_cadence_hours,
              lastCrawledAt: r.last_crawled_at,
              docCount: Number(r.doc_count),
              crawlStatus: r.crawl_status as SourceInfo["crawlStatus"],
            },
          ]),
        );
        const sources = DEMO_SOURCES.map((d) => bySlug.get(d.slug) ?? d);
        for (const s of sourceRows) {
          if (!sources.find((x) => x.slug === s.slug)) {
            sources.push(bySlug.get(s.slug)!);
          }
        }

        return {
          healthy: true,
          indexedDocuments: Number(documentRows[0]?.count ?? 0),
          queuedDocuments: Number(queueRows[0]?.count ?? 0),
          crawlFailures: Number(logRows[0]?.count ?? 0),
          analyticsEvents: Number(analyticsRows[0]?.count ?? 0),
          duplicateDocuments: Number(duplicateRows[0]?.duplicate_documents ?? 0),
          duplicateGroups: Number(duplicateRows[0]?.duplicate_groups ?? 0),
          topDomains: domainRows.map((row) => ({ value: row.domain, count: Number(row.count) })),
          sources,
        };
      }),
      getDocumentsIndex().getStats(),
    ]);

    return {
      mode: "live",
      indexedDocuments: dbStatus.indexedDocuments,
      queuedDocuments: dbStatus.queuedDocuments,
      crawlFailures: dbStatus.crawlFailures,
      analyticsEvents: dbStatus.analyticsEvents,
      duplicateDocuments: dbStatus.duplicateDocuments,
      duplicateGroups: dbStatus.duplicateGroups,
      topDomains: dbStatus.topDomains,
      sources: dbStatus.sources,
      searchEngine: {
        healthy: true,
        indexUid: env.meiliIndexName,
        numberOfDocuments: meiliStatus.numberOfDocuments,
      },
      database: { healthy: dbStatus.healthy },
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return demoStatus;
  }
}
