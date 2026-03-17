import type { StatusResponse } from "@mini-search/shared-types";

import { withDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getDocumentsIndex } from "@/lib/meili";

const demoStatus: StatusResponse = {
  mode: "demo",
  indexedDocuments: 3,
  queuedDocuments: 0,
  crawlFailures: 0,
  analyticsEvents: 0,
  duplicateDocuments: 0,
  duplicateGroups: 0,
  topDomains: [
    { value: "example.com", count: 2 },
    { value: "docs.example.dev", count: 1 },
  ],
  searchEngine: {
    healthy: false,
    indexUid: "documents",
  },
  database: {
    healthy: false,
  },
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
        ] =
          await Promise.all([
            client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM documents"),
            client.query<{ count: string }>(
              "SELECT COUNT(*)::text AS count FROM crawl_queue WHERE status IN ('pending', 'processing')",
            ),
            client.query<{ count: string }>(
              "SELECT COUNT(*)::text AS count FROM crawl_logs WHERE error_message IS NOT NULL OR status_code >= 400",
            ),
            client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM search_analytics"),
            client.query<{ duplicate_documents: string; duplicate_groups: string }>(
              `SELECT
                 COALESCE(SUM(group_count) - COUNT(*), 0)::text AS duplicate_documents,
                 COUNT(*)::text AS duplicate_groups
               FROM (
                 SELECT COUNT(*) AS group_count
                 FROM documents
                 GROUP BY content_hash
                 HAVING COUNT(*) > 1
               ) duplicate_groups`,
            ),
            client.query<{ domain: string; count: string }>(
              `SELECT domain, COUNT(*)::text AS count
               FROM documents
               GROUP BY domain
               ORDER BY COUNT(*) DESC, domain ASC
               LIMIT 5`,
            ),
          ]);

        return {
          healthy: true,
          indexedDocuments: Number(documentRows[0]?.count ?? "0"),
          queuedDocuments: Number(queueRows[0]?.count ?? "0"),
          crawlFailures: Number(logRows[0]?.count ?? "0"),
          analyticsEvents: Number(analyticsRows[0]?.count ?? "0"),
          duplicateDocuments: Number(duplicateRows[0]?.duplicate_documents ?? "0"),
          duplicateGroups: Number(duplicateRows[0]?.duplicate_groups ?? "0"),
          topDomains: domainRows.map((row) => ({
            value: row.domain,
            count: Number(row.count),
          })),
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
      searchEngine: {
        healthy: true,
        indexUid: env.meiliIndexName,
        numberOfDocuments: meiliStatus.numberOfDocuments,
      },
      database: {
        healthy: dbStatus.healthy,
      },
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return demoStatus;
  }
}
