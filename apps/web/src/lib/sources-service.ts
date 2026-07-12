import type { SourceInfo, SourcesResponse } from "@mini-search/shared-types";

import { withDb } from "@/lib/db";
import { env } from "@/lib/env";
import { getFallbackSources } from "@/lib/sources";

export async function getSources(): Promise<SourcesResponse> {
  const fallback = getFallbackSources();
  try {
    const liveSources = await withDb(async (client) => {
      const { rows } = await client.query<{
        slug: string;
        name: string;
        description: string | null;
        home_url: string;
        authority_weight: number;
        crawl_cadence_hours: number;
        last_crawled_at: string | null;
        doc_count: string;
        crawl_status: string;
      }>(
        `SELECT sr.slug, sr.name, sr.description, sr.home_url, sr.authority_weight,
                sr.crawl_cadence_hours, COALESCE(sr.last_successful_crawl_at, sr.last_crawled_at) AS last_crawled_at, sr.crawl_status,
                COALESCE(dc.doc_count, 0)::text AS doc_count
         FROM source_registry sr
         LEFT JOIN (
           SELECT source_slug, COUNT(*) AS doc_count
           FROM documents WHERE source_slug IS NOT NULL AND status = 'indexed' GROUP BY source_slug
         ) dc ON dc.source_slug = sr.slug
         ORDER BY sr.authority_weight DESC, sr.name ASC`,
      );
      return rows.map((row): SourceInfo => ({
        slug: row.slug,
        name: row.name,
        description: row.description ?? "",
        homeUrl: row.home_url,
        authorityWeight: row.authority_weight,
        crawlCadenceHours: row.crawl_cadence_hours,
        lastCrawledAt: row.last_crawled_at,
        docCount: Number(row.doc_count),
        crawlStatus: row.crawl_status as SourceInfo["crawlStatus"],
      }));
    });

    const bySlug = new Map(liveSources.map((source) => [source.slug, source]));
    const merged = fallback.map((source) => ({ ...source, ...bySlug.get(source.slug), description: source.description }));
    for (const source of liveSources) {
      if (!merged.some((item) => item.slug === source.slug)) merged.push(source);
    }
    return { mode: "live", sources: merged };
  } catch {
    return { mode: env.enableDemoMode ? "demo" : "unavailable", sources: fallback };
  }
}
