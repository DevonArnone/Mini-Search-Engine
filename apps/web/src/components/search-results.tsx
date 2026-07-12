"use client";

import { ArrowUpRight, Braces, ChevronLeft, ChevronRight, Clock3, RotateCcw, SearchX } from "lucide-react";
import React, { Fragment } from "react";

import { SourceMark } from "@/components/source-mark";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import type { SearchResponse, SearchResult } from "@/types/search";
import { CONTENT_LABELS } from "@/components/search-filters";

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function HighlightedText({ text }: { text: string }) {
  const parts = text.replace(/<(?!\/?em\b)[^>]*>/gi, "").split(/(<em>.*?<\/em>)/gi);
  return (
    <>
      {parts.map((part, index) => {
        const highlighted = /^<em>.*<\/em>$/i.test(part);
        const clean = decodeEntities(part.replace(/<\/?em>/gi, ""));
        return highlighted ? <mark key={`${clean}-${index}`}>{clean}</mark> : <Fragment key={`${clean}-${index}`}>{clean}</Fragment>;
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

function freshness(result: SearchResult) {
  if (result.lastUpdatedAt) {
    const date = new Date(result.lastUpdatedAt);
    if (!Number.isNaN(date.getTime())) return `Updated ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (result.freshnessStatus === "fresh") return "Updated recently";
  if (result.freshnessStatus === "stale") return "Update may be stale";
  return null;
}

export function ResultCard({ result, rank, onTrackClick }: { result: SearchResult; rank: number; onTrackClick: () => void }) {
  const source = result.sourceSlug ? SOURCE_BY_SLUG.get(result.sourceSlug) : undefined;
  const updated = freshness(result);

  return (
    <article className="card card-interactive p-4 sm:p-5">
      <div className="flex gap-3.5">
        {result.sourceSlug ? <SourceMark size="sm" slug={result.sourceSlug} /> : null}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium text-ink">{source?.shortName ?? result.sourceName ?? result.domain}</span>
            {result.contentType ? <span className="badge bg-slate-100 text-slate-600">{CONTENT_LABELS[result.contentType]}</span> : null}
            {result.sectionPath ? <span className="hidden truncate sm:inline">{result.sectionPath}</span> : null}
          </div>
          <h2 className="text-base font-semibold leading-6 text-ink sm:text-lg">
            <a className="rounded-sm hover:text-teal-800 hover:underline" href={result.url} onClick={onTrackClick} rel="noopener noreferrer" target="_blank">
              <HighlightedText text={result.highlights[0] ?? result.title} />
              <ArrowUpRight aria-hidden className="ml-1 inline h-3.5 w-3.5 align-baseline text-slate-400" />
            </a>
          </h2>
          <p className="mt-0.5 truncate font-mono text-[11px] text-teal-700">{displayUrl(result.url)}</p>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600"><HighlightedText text={result.snippet} /></p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            {result.codeBlockCount > 0 ? <span className="inline-flex items-center gap-1"><Braces aria-hidden className="h-3.5 w-3.5" />{result.codeBlockCount} code {result.codeBlockCount === 1 ? "example" : "examples"}</span> : null}
            {updated ? <span className="inline-flex items-center gap-1"><Clock3 aria-hidden className="h-3.5 w-3.5" />{updated}</span> : null}
            {result.whyMatched.length > 0 ? <span>Matched in {result.whyMatched.slice(0, 3).join(", ")}</span> : null}
            <span className="ml-auto font-mono text-[10px] text-slate-400">#{rank}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ResultsSkeleton() {
  return (
    <div aria-label="Loading search results" className="space-y-3" role="status">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="card animate-pulse p-5" key={index}>
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="mt-3 h-5 w-2/3 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function SearchEmptyState({ query, suggestions, onSearch }: { query: string; suggestions?: string[]; onSearch: (query: string) => void }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <SearchX aria-hidden className="mx-auto h-8 w-8 text-slate-400" />
      <h2 className="mt-4 text-base font-semibold text-ink">{query ? "No matching documentation" : "Search official developer documentation"}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted">{query ? `No results matched “${query}”. Broaden the query or remove a filter.` : "Search across MDN, React, Next.js, TypeScript, and PostgreSQL from one workspace."}</p>
      {suggestions?.length ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => <button className="button-secondary min-h-9 px-3 py-1.5 text-xs" key={suggestion} onClick={() => onSearch(suggestion)} type="button">{suggestion}</button>)}
        </div>
      ) : null}
    </div>
  );
}

export function SearchError({ message, hasResults, onRetry }: { message: string; hasResults: boolean; onRetry: () => void }) {
  return (
    <div className={`flex flex-col gap-3 rounded-md border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${hasResults ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-900"}`} role="alert">
      <span>{message}</span>
      <button className="button-secondary min-h-8 shrink-0 px-3 py-1 text-xs" onClick={onRetry} type="button"><RotateCcw aria-hidden className="h-3.5 w-3.5" />Retry</button>
    </div>
  );
}

export function Pagination({ response, page, onPageChange }: { response: SearchResponse; page: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(response.totalHits / response.limit));
  if (response.totalHits <= response.limit) return null;
  return (
    <nav aria-label="Search results pages" className="flex items-center justify-between border-t border-line pt-4">
      <button className="button-secondary px-3" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button"><ChevronLeft aria-hidden className="h-4 w-4" />Previous</button>
      <span className="text-sm text-muted">Page <strong className="font-semibold text-ink">{page}</strong> of {totalPages}</span>
      <button className="button-secondary px-3" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">Next<ChevronRight aria-hidden className="h-4 w-4" /></button>
    </nav>
  );
}
