import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { HomeSearch } from "@/components/home-search";
import { HighlightedText } from "@/components/search-results";
import { SourceMark } from "@/components/source-mark";
import { PipelineFigure } from "@/components/visuals/pipeline-figure";
import { Shelf } from "@/components/visuals/shelf";
import { formatCount } from "@/lib/format";
import { runSearch } from "@/lib/search";
import { SOURCE_BY_SLUG, SOURCE_DEFINITIONS } from "@/lib/sources";
import { getStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const SAMPLE_QUERIES = ["useEffect cleanup", "CSS subgrid", "conditional types", "window functions"];
const SPECIMEN_QUERY = "useEffect cleanup";

const STATIONS = [
  { name: "Fetch", detail: "Allowlisted official sites only. robots.txt is honored and each site gets at most one request per second." },
  { name: "Extract", detail: "Title, headings, body text, breadcrumbs, and dates are pulled from the page. Canonical and duplicate pages collapse into one record." },
  { name: "Publish", detail: "Documents are written to PostgreSQL, then published in immutable batches of up to 250 behind an atomically replaced manifest." },
  { name: "Index", detail: "A worker tokenizes each batch into postings lists and applies it whole, so a search never sees half a batch." },
];

// One real result, fetched through the same code path as the search page.
async function getSpecimen() {
  try {
    const response = await runSearch({ q: SPECIMEN_QUERY, page: 1, limit: 1, source: [], contentType: [], domain: [], language: [], tags: [], sort: "relevance" });
    if (response.mode !== "live" || !response.results[0]) return null;
    return { response, result: response.results[0] };
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [status, specimen] = await Promise.all([getStatus(), getSpecimen()]);
  const engineReady = status.searchEngine.healthy;
  const countsKnown = status.database.healthy;
  const bySlug = new Map(status.sources.map((source) => [source.slug, source]));
  const volumes = SOURCE_DEFINITIONS.map((source) => {
    const current = bySlug.get(source.slug);
    return {
      slug: source.slug,
      docCount: countsKnown ? current?.docCount ?? 0 : null,
      crawlStatus: countsKnown ? current?.crawlStatus ?? null : null,
      lastCrawledAt: countsKnown ? current?.lastCrawledAt ?? null : null,
    };
  });
  const indexed = engineReady ? status.searchEngine.numberOfDocuments ?? 0 : 0;

  return (
    <main id="main-content">
      <section className="page grid gap-x-12 gap-y-12 pb-16 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pb-24 lg:pt-20">
        <div className="min-w-0 lg:pt-6">
          <h1 className="display text-[clamp(2.75rem,6.4vw,5.5rem)]">
            Five official manuals,<br /><em className="font-normal">one index.</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-soft">
            Search MDN, React, Next.js, TypeScript, and PostgreSQL documentation together. Results are ranked by this project&rsquo;s own BM25 engine and link straight to the publisher&rsquo;s page.
          </p>

          <div className="mt-8 max-w-xl">
            <HomeSearch />
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
              <span>Try</span>
              {SAMPLE_QUERIES.map((query) => <Link className="link text-ink" href={`/search?q=${encodeURIComponent(query)}`} key={query}>{query}</Link>)}
            </p>
          </div>

          {!engineReady ? (
            <p className="notice mt-8 max-w-xl" role="status">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <span>
                <strong className="font-semibold">The search index is unavailable.</strong>{" "}
                {status.searchEngine.state === "hydrating" ? "It is still loading into memory; searches will work in a moment." : status.searchEngine.state === "missing" ? "No index has been published yet. Run a crawl or a rebuild first." : "Searches will fail until the search service is back."}
              </span>
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <Shelf volumes={volumes} />
          {!countsKnown ? <p className="mt-3 text-sm text-ink-soft">Document counts are unavailable because the database is not connected.</p> : null}
        </div>
      </section>

      <section className="border-y border-rule-strong bg-paper-raised">
        <div className="page py-14 lg:py-20">
          <h2 className="display max-w-2xl text-[clamp(2rem,4vw,3.25rem)]">How a page becomes a result</h2>
          <p className="mt-4 max-w-prose text-ink-soft">
            Nothing here is delegated to a hosted search service. The crawler, the index format, and the ranking function are part of this repository.
          </p>
          <div className="mt-10">
            <PipelineFigure live={engineReady} />
          </div>
          <ol className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {STATIONS.map((station) => (
              <li className="border-t border-ink pt-3" key={station.name}>
                <h3 className="font-display text-xl font-medium text-ink">{station.name}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{station.detail}</p>
              </li>
            ))}
          </ol>
          {engineReady ? (
            <p className="mt-10 text-sm text-ink-soft">
              Right now the index holds <span className="font-mono text-ink">{formatCount(indexed)}</span> documents at revision <span className="font-mono text-ink">{status.searchEngine.indexRevision}</span>.
            </p>
          ) : null}
        </div>
      </section>

      {specimen ? (
        <section className="page grid gap-x-12 gap-y-8 py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-20">
          <div>
            <h2 className="display text-[clamp(2rem,4vw,3.25rem)]">Every result shows its working</h2>
            <p className="mt-4 max-w-md text-ink-soft">
              This is the live top result for &ldquo;{SPECIMEN_QUERY}&rdquo;, fetched as this page rendered. Each entry carries where it came from, which fields matched, and the score that ranked it.
            </p>
            <Link className="button mt-6" href={`/search?q=${encodeURIComponent(SPECIMEN_QUERY)}`}>
              See the full result list
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>

          <figure className="min-w-0 border border-rule-strong bg-paper-raised p-5 sm:p-7" data-source={specimen.result.sourceSlug ?? undefined} style={{ borderRadius: 3 }}>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-ink-soft">
              {specimen.result.sourceSlug ? <SourceMark size="sm" slug={specimen.result.sourceSlug} /> : null}
              <span className="font-semibold text-cloth-text">{(specimen.result.sourceSlug && SOURCE_BY_SLUG.get(specimen.result.sourceSlug)?.shortName) ?? specimen.result.domain}</span>
              {specimen.result.sectionPath ? <span className="truncate text-ink-faint">{specimen.result.sectionPath}</span> : null}
            </div>
            <p className="mt-2 font-display text-2xl font-medium leading-snug text-ink"><HighlightedText text={specimen.result.highlights[0] ?? specimen.result.title} /></p>
            <p className="mt-1 truncate font-mono text-xs text-ink-soft">{specimen.result.url}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft"><HighlightedText text={specimen.result.snippet} /></p>
            <figcaption className="mt-5 border-t border-rule pt-4">
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="font-semibold text-ink-soft">Matched in</dt>
                <dd className="text-ink">{specimen.result.whyMatched.join(", ")}</dd>
                {typeof specimen.result.score === "number" ? <><dt className="font-semibold text-ink-soft">Relevance score</dt><dd className="font-mono text-xs text-ink sm:pt-0.5">{specimen.result.score.toFixed(3)} · BM25, k1 1.2, b 0.75, title weighted 4×</dd></> : null}
                <dt className="font-semibold text-ink-soft">Candidates</dt>
                <dd className="text-ink">{formatCount(specimen.response.totalHits)} matching documents</dd>
                <dt className="font-semibold text-ink-soft">Engine time</dt>
                <dd className="font-mono text-xs text-ink sm:pt-0.5">{specimen.response.processingTimeMs.toFixed(2)} ms for this query</dd>
              </dl>
            </figcaption>
          </figure>
        </section>
      ) : null}

      <section className="page border-t border-rule-strong pt-10">
        <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-3">
          <li>
            <Link className="group block" href="/sources">
              <span className="font-display text-2xl font-medium text-ink group-hover:underline">Browse the sources</span>
              <span className="mt-1 block text-sm text-ink-soft">What is indexed from each publisher, how recently, and how much.</span>
            </Link>
          </li>
          <li>
            <Link className="group block" href="/insights">
              <span className="font-display text-2xl font-medium text-ink group-hover:underline">Read the insights</span>
              <span className="mt-1 block text-sm text-ink-soft">Query volume, latency, and zero-result searches from real usage.</span>
            </Link>
          </li>
          <li>
            <a className="group block" href="https://github.com/DevonArnone/Mini-Search-Engine" rel="noopener noreferrer" target="_blank">
              <span className="font-display text-2xl font-medium text-ink group-hover:underline">Inspect the code</span>
              <span className="mt-1 block text-sm text-ink-soft">The engine, the crawler, and the benchmark evidence, on GitHub.</span>
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
