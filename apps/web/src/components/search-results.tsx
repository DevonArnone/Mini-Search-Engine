"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight, Braces, ChevronDown, RotateCcw, TriangleAlert } from "lucide-react";
import React, { Fragment, useId, useState } from "react";

import { CONTENT_LABELS } from "@/components/search-filters";
import { SourceMark } from "@/components/source-mark";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import type { SearchResponse, SearchResult } from "@/types/search";

function decodeEntities(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;", "&");
}

// Renders engine highlights as text plus <mark>. The string is never parsed as
// HTML: anything other than <em> is dropped and the rest becomes text nodes.
export function HighlightedText({ text }: { text: string }) {
  const parts = text.replace(/<(?!\/?em\b)[^>]*>/gi, "").split(/(<em>.*?<\/em>)/gi);
  return (
    <>
      {parts.map((part, index) => {
        const highlighted = /^<em>.*<\/em>$/i.test(part);
        const clean = decodeEntities(part.replace(/<\/?em>/gi, ""));
        return highlighted ? <mark key={index}>{clean}</mark> : <Fragment key={index}>{clean}</Fragment>;
      })}
    </>
  );
}

function displayUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.hostname}${path}`;
  } catch {
    return value;
  }
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) || !value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// What is known about how current the page is, in order of precision.
function freshness(result: SearchResult): { label: string; stale: boolean } | null {
  const updated = formatDate(result.lastUpdatedAt);
  if (updated) return { label: `Updated ${updated}`, stale: result.freshnessStatus === "stale" };
  if (result.freshnessStatus === "fresh") return { label: "Crawled within the last week", stale: false };
  if (result.freshnessStatus === "ok") return { label: "Crawled within the last month", stale: false };
  if (result.freshnessStatus === "stale") return { label: "Crawled over a month ago", stale: true };
  return null;
}

export function ResultEntry({ result, rank, indexRevision, onTrackClick }: { result: SearchResult; rank: number; indexRevision: string | null; onTrackClick: () => void }) {
  const source = result.sourceSlug ? SOURCE_BY_SLUG.get(result.sourceSlug) : undefined;
  const fresh = freshness(result);
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const published = formatDate(result.publishedAt);

  const provenance: Array<[string, React.ReactNode]> = [];
  provenance.push(["Address", <span className="break-all font-mono text-xs" key="url">{result.url}</span>]);
  if (result.sectionPath) provenance.push(["Section", result.sectionPath]);
  if (result.sourceName) provenance.push(["Publisher", result.sourceName]);
  if (result.whyMatched.length) provenance.push(["Matched in", result.whyMatched.join(", ")]);
  if (typeof result.score === "number") provenance.push(["Relevance score", <span className="font-mono text-xs" key="score">{result.score.toFixed(3)} (BM25)</span>]);
  if (published) provenance.push(["Published", published]);
  if (fresh) provenance.push(["Freshness", fresh.label]);
  if (result.language) provenance.push(["Language", result.language]);
  if (result.tags.length) provenance.push(["Tags", result.tags.join(", ")]);
  if (indexRevision) provenance.push(["Index revision", <span className="font-mono text-xs" key="revision">{indexRevision}</span>]);

  return (
    <article className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t border-rule py-5 first:border-t-0 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-x-4" data-source={result.sourceSlug ?? undefined}>
      {/* The only thing rank changes is the weight of this numeral. */}
      <span aria-hidden className={`pt-1 text-right font-mono text-sm ${rank <= 3 ? "font-semibold text-ink" : "text-ink-faint"}`}>{rank}</span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-soft">
          {result.sourceSlug ? <SourceMark size="sm" slug={result.sourceSlug} /> : null}
          <span className="font-semibold text-cloth-text">{source?.shortName ?? result.sourceName ?? result.domain}</span>
          {result.contentType ? <span>{CONTENT_LABELS[result.contentType]}</span> : null}
          {result.sectionPath ? <span className="hidden min-w-0 truncate text-ink-faint md:inline">{result.sectionPath}</span> : null}
        </div>

        <h3 className="mt-1.5 font-display text-xl font-medium leading-snug text-ink">
          <a className="decoration-rule-strong decoration-1 underline-offset-4 hover:underline" href={result.url} onClick={onTrackClick} rel="noopener noreferrer" target="_blank">
            <HighlightedText text={result.highlights[0] ?? result.title} />
            <ArrowUpRight aria-hidden className="ml-1 inline h-4 w-4 align-baseline text-ink-faint" />
            <span className="sr-only"> (opens the official page in a new tab)</span>
          </a>
        </h3>
        <p className="mt-0.5 truncate font-mono text-xs text-ink-soft">{displayUrl(result.url)}</p>

        {result.snippet ? <p className="mt-2 line-clamp-3 max-w-prose text-sm leading-relaxed text-ink-soft"><HighlightedText text={result.snippet} /></p> : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          {fresh ? (
            <span className={`inline-flex items-center gap-1.5 ${fresh.stale ? "font-medium text-warn" : ""}`}>
              {fresh.stale ? <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> : null}
              {fresh.label}
            </span>
          ) : null}
          {result.codeBlockCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Braces aria-hidden className="h-3.5 w-3.5" />
              {result.codeBlockCount} code {result.codeBlockCount === 1 ? "example" : "examples"}
            </span>
          ) : null}
          {result.whyMatched.length > 0 ? <span>Matched in {result.whyMatched.slice(0, 3).join(", ")}</span> : null}
          <button aria-controls={detailsId} aria-expanded={open} className="-my-2 ml-auto inline-flex min-h-9 items-center gap-1 font-medium text-ink-soft hover:text-ink" onClick={() => setOpen((current) => !current)} type="button">
            Provenance
            <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>

        <dl className={`mt-3 gap-x-6 gap-y-2 border-l border-rule-strong pl-4 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)] ${open ? "grid" : "hidden"}`} id={detailsId}>
          {provenance.map(([term, detail]) => (
            <Fragment key={term}>
              <dt className="text-xs font-semibold text-ink-soft sm:pt-0.5">{term}</dt>
              <dd className="min-w-0 text-ink">{detail}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </article>
  );
}

export function ResultsSkeleton() {
  return (
    <div aria-label="Loading search results" role="status">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t border-rule py-5 first:border-t-0 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-x-4" key={index}>
          <div className="skeleton ml-auto mt-1 h-4 w-4" />
          <div>
            <div className="skeleton h-4 w-40" />
            <div className="skeleton mt-3 h-6 w-3/5" />
            <div className="skeleton mt-2 h-3.5 w-2/5" />
            <div className="skeleton mt-3 h-3.5 w-full max-w-prose" />
            <div className="skeleton mt-2 h-3.5 w-4/5 max-w-prose" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchPrompt({ sourceName, samples, onSearch }: { sourceName?: string; samples: string[]; onSearch: (query: string) => void }) {
  return (
    <div className="max-w-xl py-10">
      <h3 className="font-display text-2xl font-medium text-ink">{sourceName ? `Ask ${sourceName} for something.` : "Ask the stacks for something."}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Type a term, an API name, or a few words and press Enter. Results are ranked with BM25 over each page&rsquo;s title, headings, description, and body, and every one links to the official page.
      </p>
      {samples.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {samples.map((sample) => <button className="button-quiet min-h-10 px-3 font-medium" key={sample} onClick={() => onSearch(sample)} type="button">{sample}</button>)}
        </div>
      ) : null}
    </div>
  );
}

export function NoResults({ query, filtered, suggestions, onSearch, onClearFilters }: { query: string; filtered: boolean; suggestions?: string[]; onSearch: (query: string) => void; onClearFilters: () => void }) {
  return (
    <div className="max-w-xl py-10">
      <h3 className="font-display text-2xl font-medium text-ink [overflow-wrap:anywhere]">{query ? <>Nothing on the shelves for &ldquo;{query}&rdquo;.</> : "No documents match these filters."}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {filtered ? "The filters may be excluding the page you want. Remove them, or try a broader term." : "No indexed page contains these words, and nothing close enough to correct a typo was found. Try a broader term."}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {filtered ? <button className="button min-h-10" onClick={onClearFilters} type="button">Clear filters</button> : null}
        {suggestions?.map((suggestion) => <button className="button-quiet min-h-10 px-3 font-medium" key={suggestion} onClick={() => onSearch(suggestion)} type="button">{suggestion}</button>)}
      </div>
    </div>
  );
}

export function SearchError({ message, hasResults, onRetry }: { message: string; hasResults: boolean; onRetry: () => void }) {
  return (
    <div className="notice border-bad" role="alert">
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{message}</p>
        <p className="mt-0.5 text-ink-soft">{hasResults ? "The results below are from your previous search." : "Nothing was returned. The search engine may still be loading its index."}</p>
      </div>
      <button className="button-quiet min-h-9 shrink-0 px-3" onClick={onRetry} type="button"><RotateCcw aria-hidden className="h-3.5 w-3.5" />Try again</button>
    </div>
  );
}

export function Pagination({ response, page, onPageChange }: { response: SearchResponse; page: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(response.totalHits / response.limit));
  if (totalPages <= 1) return null;
  const first = (page - 1) * response.limit + 1;
  const last = Math.min(page * response.limit, response.totalHits);
  return (
    <nav aria-label="Search results pages" className="flex items-center justify-between gap-3 border-t border-rule-strong pt-4">
      <button aria-label="Previous page" className="button-quiet px-3" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button"><ArrowLeft aria-hidden className="h-4 w-4" /><span className="hidden sm:inline">Previous</span></button>
      <p className="text-center text-sm text-ink-soft">
        <span className="font-mono text-xs">{first.toLocaleString("en-US")}–{last.toLocaleString("en-US")}</span> of {response.totalHits.toLocaleString("en-US")}
        <span className="mx-2 text-rule-strong" aria-hidden>·</span>
        Page <strong className="font-semibold text-ink">{page}</strong> of {totalPages.toLocaleString("en-US")}
      </p>
      <button aria-label="Next page" className="button-quiet px-3" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button"><span className="hidden sm:inline">Next</span><ArrowRight aria-hidden className="h-4 w-4" /></button>
    </nav>
  );
}
