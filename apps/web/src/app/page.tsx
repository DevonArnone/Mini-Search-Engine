import Link from "next/link";

import { StatusOverview } from "@/components/status-overview";
import { getStatus } from "@/lib/status";

export default async function HomePage() {
  const status = await getStatus();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-16">
      <section className="flex flex-1 flex-col justify-center">
        <p className="text-sm uppercase tracking-[0.25em] text-ocean">Mini Search Engine</p>
        <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold tracking-tight text-ink md:text-7xl">
          Crawl, index, and search a measurable document corpus with a real search stack.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
          Python handles ingestion and ETL. PostgreSQL stores crawl state and analytics.
          Meilisearch serves fast retrieval. Next.js exposes the search workspace and system status.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white"
            href="/search"
          >
            Launch Search
          </Link>
          <Link
            className="inline-flex rounded-full border border-orange-200 bg-white/80 px-6 py-3 text-sm font-medium text-ink"
            href="/api/status"
          >
            View Status JSON
          </Link>
        </div>
      </section>

      <div className="mt-14">
        <StatusOverview status={status} />
      </div>
    </main>
  );
}
