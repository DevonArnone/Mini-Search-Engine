"""Report what the crawl actually produced, and reconcile it across stores.

Counts come from PostgreSQL (the source of truth) and from the published
index itself, and must agree. Pass --base-url to also check the running web
application.

    python scripts/corpus_report.py --since 2026-10-07T18:00:00Z --out docs/evidence/corpus
"""

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.settings import settings
from app.db.connection import db_cursor
from app.indexer.native import NativeIndexWriter
from app.pipeline.seeds import get_all_sources

SYNTHETIC_SUFFIX = ".synthetic.local"


def rows(cur, query: str, params: tuple = ()) -> list[dict]:
    cur.execute(query, params)
    return [dict(row) for row in cur.fetchall()]


def build_report(since: datetime, base_url: str | None) -> dict:
    naive_since = since.astimezone(timezone.utc).replace(tzinfo=None)
    with db_cursor() as cur:
        by_source = rows(
            cur,
            """
            SELECT source_slug AS source,
                   COUNT(*) FILTER (WHERE status = 'indexed')::int AS indexed,
                   COUNT(*) FILTER (WHERE status IN ('stored', 'index_failed'))::int AS awaiting_publication,
                   COUNT(*) FILTER (WHERE status = 'duplicate')::int AS duplicate_content,
                   COUNT(*) FILTER (WHERE status = 'excluded')::int AS out_of_scope,
                   COUNT(*) FILTER (WHERE status = 'gone')::int AS gone
            FROM documents WHERE source_slug IS NOT NULL
            GROUP BY source_slug ORDER BY source_slug
            """,
        )
        uniqueness = rows(
            cur,
            """
            SELECT COUNT(*)::int AS indexed,
                   COUNT(DISTINCT url)::int AS distinct_urls,
                   COUNT(DISTINCT content_hash)::int AS distinct_content_hashes,
                   COUNT(*) FILTER (WHERE domain LIKE %s OR source_slug IS NULL)::int AS synthetic,
                   COUNT(*) FILTER (WHERE last_crawled_at >= %s)::int AS fetched_in_this_crawl,
                   MIN(last_crawled_at) AS oldest_fetch,
                   MAX(last_crawled_at) AS newest_fetch
            FROM documents WHERE status = 'indexed'
            """,
            (f"%{SYNTHETIC_SUFFIX}", naive_since),
        )[0]
        fetches = rows(
            cur,
            """
            SELECT CASE
                     WHEN error_message = 'blocked by robots.txt' THEN 'blocked by robots.txt'
                     WHEN status_code IS NULL THEN 'network or parse error'
                     WHEN status_code < 300 THEN '2xx'
                     WHEN status_code < 400 THEN '3xx'
                     WHEN status_code < 500 THEN '4xx'
                     ELSE '5xx'
                   END AS outcome,
                   COUNT(*)::int AS requests
            FROM crawl_logs WHERE fetched_at >= %s
            GROUP BY 1 ORDER BY 2 DESC
            """,
            (naive_since,),
        )
        fetch_window = rows(
            cur,
            """
            SELECT MIN(fetched_at) AS first_request, MAX(fetched_at) AS last_request,
                   COUNT(*)::int AS requests,
                   ROUND(AVG(response_time_ms) FILTER (WHERE status_code IS NOT NULL))::int AS mean_response_ms
            FROM crawl_logs WHERE fetched_at >= %s
            """,
            (naive_since,),
        )[0]
        per_domain_rate = rows(
            cur,
            """
            SELECT split_part(split_part(url, '://', 2), '/', 1) AS domain,
                   COUNT(*)::int AS requests,
                   ROUND(COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(fetched_at) - MIN(fetched_at))), 1)::numeric, 2)::float AS requests_per_second
            FROM crawl_logs WHERE fetched_at >= %s AND status_code IS NOT NULL
            GROUP BY 1 ORDER BY 2 DESC
            """,
            (naive_since,),
        )
        queue = rows(
            cur,
            """
            SELECT status, COALESCE(detail, '') AS detail, COUNT(*)::int AS urls
            FROM crawl_queue WHERE source_slug IS NOT NULL
            GROUP BY 1, 2 ORDER BY 3 DESC
            """,
        )

    index_ids = NativeIndexWriter(settings.search_index_dir).live_document_ids()
    manifest = NativeIndexWriter(settings.search_index_dir).read_manifest() or {}
    reconciliation = {
        "postgresIndexed": uniqueness["indexed"],
        "nativeIndexLiveDocuments": len(index_ids),
        "indexGeneration": manifest.get("generation"),
        "indexBatches": len(manifest.get("batches", [])),
    }
    if base_url:
        with urllib.request.urlopen(f"{base_url.rstrip('/')}/api/status", timeout=15) as response:
            status = json.load(response)
        reconciliation["webApplicationDocuments"] = status["searchEngine"].get("numberOfDocuments")
        reconciliation["webApplicationIndexRevision"] = status["searchEngine"].get("indexRevision")
    counts = [value for key, value in reconciliation.items() if key in ("postgresIndexed", "nativeIndexLiveDocuments", "webApplicationDocuments")]
    reconciliation["consistent"] = len(set(counts)) == 1

    sources = get_all_sources(settings.seed_config_path)
    return {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "crawlSince": since.isoformat(),
        "uniqueIndexedDocuments": uniqueness["indexed"],
        "uniqueness": {key: (value.isoformat() if isinstance(value, datetime) else value) for key, value in uniqueness.items()},
        "bySource": by_source,
        "fetchOutcomes": fetches,
        "fetchWindow": {key: (value.isoformat() if isinstance(value, datetime) else value) for key, value in fetch_window.items()},
        "requestsPerSecondByDomain": per_domain_rate,
        "queueOutcomes": queue,
        "duplicateExclusions": {
            "sameCanonicalUrl": sum(row["urls"] for row in queue if row["status"] == "duplicate" and row["detail"] == "canonical"),
            "sameContent": sum(row["duplicate_content"] for row in by_source),
        },
        "reconciliation": reconciliation,
        "configuration": {
            "userAgent": settings.crawler_user_agent,
            "respectsRobots": not settings.crawler_ignore_robots,
            "maxRetries": settings.crawler_max_retries,
            "concurrency": settings.crawler_concurrency,
            "minimumWords": settings.crawler_min_words,
            "batchSize": settings.index_batch_size,
            "sources": [
                {
                    "slug": source["slug"],
                    "allowedDomains": source.get("allowed_domains", []),
                    "includePathPrefixes": source.get("include_path_prefixes", []),
                    "rateLimitPerDomainMs": source.get("rate_limit_per_domain_ms"),
                    "maxDepth": source.get("max_depth"),
                    "sitemaps": source.get("sitemaps", []),
                }
                for source in sources
            ],
        },
    }


def to_markdown(report: dict) -> str:
    unique = report["uniqueness"]
    reconciliation = report["reconciliation"]
    lines = [
        "# Corpus report",
        "",
        f"Generated {report['generatedAt']} for the crawl started {report['crawlSince']}.",
        "",
        f"**{report['uniqueIndexedDocuments']:,} unique documents are indexed**, each fetched from an official site and parsed by the crawler.",
        "",
        f"- Distinct URLs: {unique['distinct_urls']:,}. Distinct content hashes: {unique['distinct_content_hashes']:,}.",
        f"- Synthetic or generated documents among them: {unique['synthetic']}.",
        f"- Fetched during this crawl: {unique['fetched_in_this_crawl']:,}. Oldest fetch {unique['oldest_fetch']}, newest {unique['newest_fetch']} (UTC).",
        "",
        "## By source",
        "",
        "| Source | Indexed | Awaiting publication | Duplicate content | Out of scope | Gone |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in report["bySource"]:
        lines.append(f"| {row['source']} | {row['indexed']:,} | {row['awaiting_publication']:,} | {row['duplicate_content']:,} | {row['out_of_scope']:,} | {row['gone']:,} |")
    lines += ["", "## Fetch outcomes", "", f"{report['fetchWindow']['requests']:,} requests between {report['fetchWindow']['first_request']} and {report['fetchWindow']['last_request']} (UTC); mean response {report['fetchWindow']['mean_response_ms']} ms.", "", "| Outcome | Requests |", "|---|---:|"]
    lines += [f"| {row['outcome']} | {row['requests']:,} |" for row in report["fetchOutcomes"]]
    lines += ["", "| Domain | Requests | Average rate (requests/s) |", "|---|---:|---:|"]
    lines += [f"| {row['domain']} | {row['requests']:,} | {row['requests_per_second']} |" for row in report["requestsPerSecondByDomain"]]
    lines += ["", "## Queue outcomes", "", "| Status | Reason | URLs |", "|---|---|---:|"]
    lines += [f"| {row['status']} | {row['detail'] or '—'} | {row['urls']:,} |" for row in report["queueOutcomes"]]
    duplicates = report["duplicateExclusions"]
    lines += [
        "",
        "## Duplicates excluded",
        "",
        f"- {duplicates['sameCanonicalUrl']:,} URLs resolved to a canonical URL that was already stored.",
        f"- {duplicates['sameContent']:,} pages had text identical to an already stored document and were kept out of the index.",
        "",
        "## Reconciliation",
        "",
        "| Store | Documents |",
        "|---|---:|",
        f"| PostgreSQL, status `indexed` | {reconciliation['postgresIndexed']:,} |",
        f"| Native index, live documents ({reconciliation['indexBatches']} batches, generation `{reconciliation['indexGeneration']}`) | {reconciliation['nativeIndexLiveDocuments']:,} |",
    ]
    if "webApplicationDocuments" in reconciliation:
        lines.append(f"| Web application `/api/status` (revision `{reconciliation['webApplicationIndexRevision']}`) | {reconciliation['webApplicationDocuments']:,} |")
    lines += ["", f"Counts agree: **{'yes' if reconciliation['consistent'] else 'NO'}**.", "", "## Configuration", ""]
    configuration = report["configuration"]
    lines += [
        f"- User agent: `{configuration['userAgent']}`",
        f"- robots.txt respected: {'yes' if configuration['respectsRobots'] else 'NO'}",
        f"- Concurrency {configuration['concurrency']}, up to {configuration['maxRetries']} retries, pages under {configuration['minimumWords']} words skipped, index batches of up to {configuration['batchSize']}.",
        "",
        "| Source | Domains | Paths | Delay per request | Sitemaps |",
        "|---|---|---|---:|---|",
    ]
    for source in configuration["sources"]:
        lines.append(f"| {source['slug']} | {', '.join(source['allowedDomains'])} | {', '.join(source['includePathPrefixes'])} | {source['rateLimitPerDomainMs']} ms | {len(source['sitemaps'])} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--since", required=True, help="UTC time the crawl started (ISO 8601).")
    parser.add_argument("--out", help="Directory for corpus-report.json and corpus-report.md.")
    parser.add_argument("--base-url", help="Running web application to reconcile against.")
    args = parser.parse_args()

    since = datetime.fromisoformat(args.since.replace("Z", "+00:00"))
    report = build_report(since, args.base_url)
    markdown = to_markdown(report)
    if args.out:
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / "corpus-report.json").write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
        (out / "corpus-report.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    if not report["reconciliation"]["consistent"]:
        raise SystemExit("Document counts do not reconcile.")


if __name__ == "__main__":
    main()
