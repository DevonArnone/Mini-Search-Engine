import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { crawlCadence, crawlStatusLabel, formatCount, formatDay } from "@/lib/format";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import { getSources } from "@/lib/sources-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sources",
  description: "The official documentation sources indexed by DevDocs Search, with coverage and crawl health.",
};

export default async function SourcesPage() {
  const response = await getSources();
  const live = response.mode === "live";
  const sources = response.sources.filter((source) => SOURCE_BY_SLUG.has(source.slug));
  const total = sources.reduce((sum, source) => sum + source.docCount, 0);
  const largest = Math.max(1, ...sources.map((source) => source.docCount));
  const showCoverage = live && total > 0;

  return (
    <main className="page min-h-[calc(100vh-var(--header-height))] pt-10 sm:pt-14" id="main-content">
      <header className="max-w-3xl">
        <h1 className="display text-[clamp(2.25rem,5vw,3.75rem)]">The sources</h1>
        <p className="mt-3 max-w-prose text-ink-soft">
          Five publishers, each crawled from its own site within fixed path boundaries.
          {showCoverage ? <> Together they account for <span className="font-mono text-ink">{formatCount(total)}</span> indexed documents.</> : null}
        </p>
      </header>

      {!live ? (
        <div className="notice mt-8 border-bad" role="alert">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
          <div>
            <p className="font-semibold">Coverage and crawl health are unavailable.</p>
            <p className="mt-0.5 text-ink-soft">The database is not connected. What each source covers is listed below from configuration.</p>
          </div>
        </div>
      ) : null}

      {showCoverage ? (
        <section aria-labelledby="coverage-heading" className="mt-12">
          <h2 className="heading" id="coverage-heading">Indexed documents by source</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">Counts of pages currently in the index. They compare the sources with each other; they are not a share of everything each publisher has written.</p>
          <ul className="mt-5 border-t border-rule-strong">
            {[...sources].sort((a, b) => b.docCount - a.docCount).map((source) => (
              <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 border-b border-rule py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_6rem]" data-source={source.slug} key={source.slug}>
                <span className="truncate font-medium text-ink">{SOURCE_BY_SLUG.get(source.slug)?.shortName}</span>
                <span aria-hidden className="h-6 bg-paper-sunk"><span className="block h-full bg-cloth" style={{ width: `${(source.docCount / largest) * 100}%`, minWidth: source.docCount ? 2 : 0 }} /></span>
                <span className="text-right font-mono text-xs text-ink">{formatCount(source.docCount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-14 border-t border-rule-strong">
        {sources.map((source) => {
          const definition = SOURCE_BY_SLUG.get(source.slug);
          if (!definition) return null;
          const facts: Array<[string, React.ReactNode]> = [];
          if (live && source.docCount > 0) facts.push(["Indexed", <><span className="font-mono">{formatCount(source.docCount)}</span> documents</>]);
          if (live) facts.push(["Crawl", crawlStatusLabel(source.crawlStatus)]);
          const lastCrawled = live ? formatDay(source.lastCrawledAt) : null;
          if (lastCrawled) facts.push(["Last crawled", lastCrawled]);
          facts.push(["Recrawled", crawlCadence(source.crawlCadenceHours)]);

          return (
            <article className="grid gap-x-8 gap-y-5 border-b border-rule py-8 md:grid-cols-[7.5rem_minmax(0,1fr)_15rem]" data-source={source.slug} key={source.slug}>
              {/* The volume's front board. */}
              <Link aria-hidden className="hidden h-40 flex-col justify-between bg-cloth p-3 text-cloth-ink md:flex" href={`/sources/${source.slug}`} style={{ borderRadius: "1px 3px 3px 1px" }} tabIndex={-1}>
                <span className="font-mono text-2xs font-semibold">{definition.mark}</span>
                <span className="font-display text-lg font-medium leading-tight">{definition.shortName}</span>
              </Link>

              <div className="min-w-0">
                <h2 className="font-display text-2xl font-medium text-ink sm:text-3xl">
                  <span aria-hidden className="mr-2.5 inline-block h-5 w-2 bg-cloth align-baseline md:hidden" />
                  {source.name}
                </h2>
                <p className="mt-2 max-w-prose text-ink-soft">{definition.description}</p>
                <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                  <span>Look up</span>
                  {definition.sampleQueries.slice(0, 4).map((query) => <Link className="link text-ink" href={`/sources/${source.slug}?q=${encodeURIComponent(query)}`} key={query}>{query}</Link>)}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link className="button" href={`/sources/${source.slug}`}>Search {definition.shortName}<ArrowRight aria-hidden className="h-4 w-4" /></Link>
                  <a className="button-quiet" href={source.homeUrl} rel="noopener noreferrer" target="_blank">Official site<ArrowUpRight aria-hidden className="h-4 w-4" /><span className="sr-only"> (opens in a new tab)</span></a>
                </div>
              </div>

              <dl className="grid content-start gap-y-2 text-sm">
                {facts.map(([term, detail]) => (
                  <div className="flex justify-between gap-4 border-b border-rule pb-2 last:border-b-0" key={term}>
                    <dt className="text-ink-soft">{term}</dt>
                    <dd className="text-right text-ink">{detail}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </main>
  );
}
