import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ResultsSkeleton } from "@/components/search-results";
import { SearchShell } from "@/components/search-shell";
import { crawlCadence, crawlStatusLabel, formatCount, formatDay } from "@/lib/format";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import { getSources } from "@/lib/sources-service";

interface Props { params: Promise<{ slug: string }> }

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const source = SOURCE_BY_SLUG.get(slug);
  if (!source) return { title: "Source not found" };
  return { title: source.name, description: `Search the indexed ${source.name} documentation.` };
}

export default async function SourcePage({ params }: Props) {
  const { slug } = await params;
  const source = SOURCE_BY_SLUG.get(slug);
  if (!source) notFound();
  const response = await getSources();
  const live = response.mode === "live";
  const metrics = live ? response.sources.find((item) => item.slug === slug) : undefined;
  const host = new URL(source.homeUrl).hostname;

  const facts: Array<[string, React.ReactNode]> = [];
  if (metrics && metrics.docCount > 0) facts.push(["Indexed documents", formatCount(metrics.docCount)]);
  if (metrics) facts.push(["Crawl", crawlStatusLabel(metrics.crawlStatus)]);
  const lastCrawled = formatDay(metrics?.lastCrawledAt);
  if (lastCrawled) facts.push(["Last crawled", lastCrawled]);
  facts.push(["Recrawled", crawlCadence(source.crawlCadenceHours)]);

  return (
    <main id="main-content">
      {/* The volume's cover: a full band of its bookcloth. */}
      <header className="bg-cloth text-cloth-ink" data-source={slug}>
        <div className="page pb-10 pt-6 sm:pb-12">
          <Link className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline decoration-cloth-ink/40 underline-offset-4 hover:decoration-cloth-ink" href="/sources">
            <ArrowLeft aria-hidden className="h-4 w-4" />
            All sources
          </Link>
          <div className="mt-6 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold">{source.mark} · {host}</p>
              <h1 className="mt-3 font-display text-[clamp(2.5rem,6vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.022em]">{source.name}</h1>
              <p className="mt-4 max-w-prose text-lg">{source.description}</p>
              <a className="mt-6 inline-flex min-h-11 items-center gap-2 border border-cloth-ink px-4 text-sm font-semibold transition-colors duration-150 hover:bg-cloth-ink hover:text-cloth" href={source.homeUrl} rel="noopener noreferrer" style={{ borderRadius: 2 }} target="_blank">
                Open {host}
                <ArrowUpRight aria-hidden className="h-4 w-4" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
            <dl className="grid content-end gap-y-2 text-sm">
              {facts.map(([term, detail]) => (
                <div className="flex justify-between gap-4 border-b border-cloth-ink/30 pb-2" key={term}>
                  <dt>{term}</dt>
                  <dd className="text-right font-semibold">{detail}</dd>
                </div>
              ))}
              <div className="pt-1">
                <dt>Paths indexed</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed">{source.scope.join("  ")}</dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <div className="page pt-6" data-source={slug}>
        <nav aria-label={`${source.shortName} topics`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule pb-4 text-sm">
          <span className="text-ink-soft">Topics</span>
          {source.topics.map((topic) => <Link className="link min-h-8 py-1 font-medium text-ink" href={`/sources/${slug}?q=${encodeURIComponent(topic)}`} key={topic}>{topic}</Link>)}
        </nav>

        <section aria-labelledby="scoped-search-heading" className="pt-6">
          <h2 className="title mb-4" id="scoped-search-heading">Search {source.shortName}</h2>
          <Suspense fallback={<ResultsSkeleton />}>
            <SearchShell initialSource={slug} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
