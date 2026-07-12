import type { Metadata } from "next";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SearchShell } from "@/components/search-shell";
import { SourceMark } from "@/components/source-mark";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import { getSources } from "@/lib/sources-service";

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const source = SOURCE_BY_SLUG.get(slug);
  if (!source) return {};
  return { title: source.name, description: `Search indexed ${source.name} documentation.` };
}

export default async function SourcePage({ params }: Props) {
  const { slug } = await params;
  const source = SOURCE_BY_SLUG.get(slug);
  if (!source) notFound();
  const sourceResponse = await getSources();
  const metrics = sourceResponse.sources.find((item) => item.slug === slug);

  return (
    <main className="page-shell" id="main-content">
      <Link className="button-ghost -ml-3 mb-5" href="/sources"><ArrowLeft aria-hidden className="h-4 w-4" />All sources</Link>
      <header className="border-b border-line pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <SourceMark size="lg" slug={slug} />
            <div><p className="eyebrow">Source workspace</p><h1 className="page-heading mt-1.5">{source.name}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{source.description}</p></div>
          </div>
          <a className="button-secondary shrink-0" href={source.homeUrl} rel="noopener noreferrer" target="_blank">Official site<ExternalLink aria-hidden className="h-4 w-4" /></a>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Documents</dt><dd className="mt-1 font-semibold text-ink">{metrics?.docCount ? metrics.docCount.toLocaleString() : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Crawl status</dt><dd className="mt-1 font-semibold capitalize text-ink">{metrics?.crawlStatus ?? "pending"}</dd></div>
          <div><dt className="text-xs text-muted">Authority weight</dt><dd className="mt-1 font-semibold text-ink">{source.authorityWeight}/10</dd></div>
          <div><dt className="text-xs text-muted">Last crawl</dt><dd className="mt-1 font-semibold text-ink">{metrics?.lastCrawledAt ? new Date(metrics.lastCrawledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not yet"}</dd></div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-1.5">{source.topics.map((topic) => <Link className="badge border border-line bg-white text-muted hover:border-teal-300 hover:text-teal-800" href={`/search?q=${encodeURIComponent(topic)}&source=${slug}`} key={topic}>{topic}</Link>)}</div>
      </header>

      <section className="mt-7">
        <div className="mb-5"><p className="eyebrow">Scoped retrieval</p><h2 className="mt-1.5 text-xl font-semibold text-ink">Search {source.shortName}</h2></div>
        <Suspense fallback={<div className="panel p-8 text-center text-sm text-muted">Loading source search…</div>}><SearchShell initialSource={slug} /></Suspense>
      </section>
    </main>
  );
}
