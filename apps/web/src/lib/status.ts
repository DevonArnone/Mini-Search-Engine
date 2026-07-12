import type { SourceInfo, StatusResponse } from "@mini-search/shared-types";

import { withDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getDocumentsIndex } from "@/lib/meili";
import { getFallbackSources } from "@/lib/sources";

interface DatabaseStatus {
  indexedDocuments: number;
  queuedDocuments: number;
  crawlFailures: number;
  analyticsEvents: number;
  duplicateDocuments: number;
  duplicateGroups: number;
  topDomains: Array<{ value: string; count: number }>;
  sources: SourceInfo[];
}

async function getDatabaseStatus(): Promise<DatabaseStatus> {
  return withDb(async (client) => {
    const documents = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM documents WHERE status = 'indexed'",
    );
    const queue = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM crawl_queue WHERE status IN ('pending', 'processing')",
    );
    const failures = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM crawl_logs WHERE error_message IS NOT NULL OR status_code >= 400",
    );
    const analytics = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM search_analytics WHERE event_type = 'search'",
    );
    const duplicates = await client.query<{
      duplicate_documents: string;
      duplicate_groups: string;
    }>(
      `SELECT COALESCE(SUM(group_count) - COUNT(*), 0)::text AS duplicate_documents,
              COUNT(*)::text AS duplicate_groups
       FROM (SELECT COUNT(*) AS group_count FROM documents GROUP BY content_hash HAVING COUNT(*) > 1) grouped`,
    );
    const domains = await client.query<{ domain: string; count: string }>(
      "SELECT domain, COUNT(*)::text AS count FROM documents GROUP BY domain ORDER BY COUNT(*) DESC, domain ASC LIMIT 5",
    );
    const sources = await client.query<{
        slug: string; name: string; description: string | null; home_url: string;
        authority_weight: number; crawl_cadence_hours: number; last_crawled_at: string | null;
        doc_count: string; crawl_status: string;
    }>(
      `SELECT sr.slug, sr.name, sr.description, sr.home_url, sr.authority_weight,
              sr.crawl_cadence_hours, COALESCE(sr.last_successful_crawl_at, sr.last_crawled_at) AS last_crawled_at, sr.crawl_status,
              COALESCE(counts.doc_count, 0)::text AS doc_count
       FROM source_registry sr
       LEFT JOIN (SELECT source_slug, COUNT(*) AS doc_count FROM documents WHERE source_slug IS NOT NULL AND status = 'indexed' GROUP BY source_slug) counts
         ON counts.source_slug = sr.slug
       ORDER BY sr.authority_weight DESC`,
    );

    const fallback = getFallbackSources();
    const liveSources = sources.rows.map((row): SourceInfo => ({
      slug: row.slug, name: row.name, description: row.description ?? "", homeUrl: row.home_url,
      authorityWeight: row.authority_weight, crawlCadenceHours: row.crawl_cadence_hours,
      lastCrawledAt: row.last_crawled_at, docCount: Number(row.doc_count),
      crawlStatus: row.crawl_status as SourceInfo["crawlStatus"],
    }));
    const bySlug = new Map(liveSources.map((source) => [source.slug, source]));

    return {
      indexedDocuments: Number(documents.rows[0]?.count ?? 0),
      queuedDocuments: Number(queue.rows[0]?.count ?? 0),
      crawlFailures: Number(failures.rows[0]?.count ?? 0),
      analyticsEvents: Number(analytics.rows[0]?.count ?? 0),
      duplicateDocuments: Number(duplicates.rows[0]?.duplicate_documents ?? 0),
      duplicateGroups: Number(duplicates.rows[0]?.duplicate_groups ?? 0),
      topDomains: domains.rows.map((row) => ({ value: row.domain, count: Number(row.count) })),
      sources: fallback.map((source) => ({ ...source, ...bySlug.get(source.slug), description: source.description })),
    };
  });
}

export async function getStatus(): Promise<StatusResponse> {
  const [databaseResult, searchResult] = await Promise.allSettled([
    getDatabaseStatus(),
    getDocumentsIndex().getStats(),
  ]);
  const database = databaseResult.status === "fulfilled" ? databaseResult.value : null;
  const search = searchResult.status === "fulfilled" ? searchResult.value : null;
  const mode: StatusResponse["mode"] = database && search ? "live" : database || search ? "degraded" : env.enableDemoMode ? "demo" : "unavailable";

  return {
    mode,
    indexedDocuments: database?.indexedDocuments ?? search?.numberOfDocuments ?? 0,
    queuedDocuments: database?.queuedDocuments ?? 0,
    crawlFailures: database?.crawlFailures ?? 0,
    analyticsEvents: database?.analyticsEvents ?? 0,
    duplicateDocuments: database?.duplicateDocuments ?? 0,
    duplicateGroups: database?.duplicateGroups ?? 0,
    topDomains: database?.topDomains ?? [],
    sources: database?.sources ?? getFallbackSources(),
    searchEngine: { healthy: Boolean(search), indexUid: env.meiliIndexName, ...(search ? { numberOfDocuments: search.numberOfDocuments } : {}) },
    database: { healthy: Boolean(database) },
    generatedAt: new Date().toISOString(),
  };
}
