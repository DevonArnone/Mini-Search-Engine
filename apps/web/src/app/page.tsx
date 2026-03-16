import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <p className="text-sm uppercase tracking-[0.25em] text-ocean">Mini Search Engine</p>
      <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold tracking-tight text-ink md:text-7xl">
        Crawl, index, and search 10k+ documents with a real search stack.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
        Python handles ingestion and ETL. PostgreSQL stores crawl state. Meilisearch serves fast
        retrieval. Next.js delivers the search UX.
      </p>
      <div className="mt-10">
        <Link
          className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white"
          href="/search"
        >
          Launch Search
        </Link>
      </div>
    </main>
  );
}

