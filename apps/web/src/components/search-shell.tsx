"use client";

import type { Route } from "next";
import { ListFilter, LoaderCircle, Lock, TriangleAlert, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { CONTENT_LABELS, SearchFilters, UPDATED_LABELS } from "@/components/search-filters";
import { SearchInput } from "@/components/search-input";
import { NoResults, Pagination, ResultEntry, ResultsSkeleton, SearchError, SearchPrompt } from "@/components/search-results";
import { useDebounce } from "@/hooks/use-debounce";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import { parseSearchState, toSearchParams } from "@/lib/url-state";
import type { FiltersResponse, SearchResponse, SearchResult, SearchState } from "@/types/search";

const EMPTY_FILTERS: FiltersResponse = { sources: [], contentTypes: [], domains: [], languages: [], tags: [], dateBuckets: [] };
const EMPTY_RESULTS: SearchResponse = { query: "", page: 1, limit: 10, totalHits: 0, processingTimeMs: 0, mode: "live", backend: "native", indexRevision: null, results: [] };
const DEFAULT_SAMPLES = ["useEffect cleanup", "CSS subgrid", "conditional types", "window functions", "route handlers"];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Filters the visitor chose. A workspace's locked source is not one of them.
function removableFilterCount(state: SearchState, lockedSource?: string) {
  return (lockedSource ? 0 : state.source.length) + state.contentType.length + state.domain.length + state.language.length + state.tags.length + (state.updatedWithin ? 1 : 0) + (state.from ? 1 : 0) + (state.to ? 1 : 0);
}

function formatDuration(ms: number) {
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

export function SearchShell({ initialSource }: { initialSource?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const [navigationPending, startTransition] = useTransition();
  const state = useMemo(() => {
    const parsed = parseSearchState(new URLSearchParams(paramsKey));
    // A source workspace searches its own source only, whatever the URL says.
    if (initialSource) parsed.source = [initialSource];
    return parsed;
  }, [initialSource, paramsKey]);
  const stateKey = toSearchParams(state).toString();

  const [draftQuery, setDraftQuery] = useState(state.q);
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);
  const [filters, setFilters] = useState<FiltersResponse>(EMPTY_FILTERS);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const debouncedDraft = useDebounce(draftQuery.trim(), 180);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousPageRef = useRef(state.page);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setDraftQuery(state.q), [state.q]);

  // Each change is a history entry, so Back returns to the previous query,
  // filter set, or page. Corrections to an invalid URL replace instead.
  const navigate = useCallback((patch: Partial<SearchState>, options: { replace?: boolean } = {}) => {
    const next = { ...state, ...patch };
    // The locked source is implied by the route, not carried in the query string.
    const query = toSearchParams(initialSource ? { ...next, source: [] } : next).toString();
    const href = `${pathname}${query ? `?${query}` : ""}` as Route;
    startTransition(() => (options.replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false })));
  }, [initialSource, pathname, router, state]);

  const clearFilters = useCallback(() => {
    navigate({ source: initialSource ? [initialSource] : [], contentType: [], domain: [], language: [], tags: [], from: null, to: null, updatedWithin: null, page: 1 });
  }, [initialSource, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/filters", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setFilters(await response.json() as FiltersResponse);
        setFilterError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFilterError(true);
      });
    return () => controller.abort();
  }, [retryKey]);

  useEffect(() => {
    if (debouncedDraft.length < 2 || debouncedDraft === state.q) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    const controller = new AbortController();
    setSuggestionsLoading(true);
    fetch(`/api/autocomplete?q=${encodeURIComponent(debouncedDraft)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json() as { suggestions: string[] };
        setSuggestions(payload.suggestions ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      });
    return () => controller.abort();
  }, [debouncedDraft, state.q]);

  const filterCount = removableFilterCount(state, initialSource);
  const shouldSearch = Boolean(state.q || filterCount);

  useEffect(() => {
    if (!shouldSearch) {
      setResults(EMPTY_RESULTS);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(null);
    fetch(`/api/search?${stateKey}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as SearchResponse | { error?: { message?: string } };
        if (!response.ok) throw new Error("error" in payload ? payload.error?.message : "Search is temporarily unavailable.");
        const nextResults = payload as SearchResponse;
        const totalPages = Math.max(1, Math.ceil(nextResults.totalHits / nextResults.limit));
        if (state.page > totalPages) {
          navigate({ page: totalPages }, { replace: true });
          return;
        }
        setResults(nextResults);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSearchError(error instanceof Error && error.message ? error.message : "Search is temporarily unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });
    return () => controller.abort();
  }, [navigate, retryKey, shouldSearch, state.page, stateKey]);

  useEffect(() => {
    if (previousPageRef.current !== state.page && !searchLoading) {
      previousPageRef.current = state.page;
      resultsHeadingRef.current?.focus();
    }
  }, [searchLoading, state.page]);

  function submitQuery(query: string) {
    setDraftQuery(query);
    setSuggestions([]);
    navigate({ q: query, page: 1 });
  }

  // Counted only when the visitor opens a result's document.
  function trackClick(result: SearchResult, resultRank: number) {
    if (!results.searchId || !isUuid(result.id)) return;
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ searchId: results.searchId, clickedDocumentId: result.id, resultRank }),
    }).catch(() => undefined);
  }

  const hasResults = results.results.length > 0;
  const updating = (searchLoading || navigationPending) && hasResults;
  const lockedSource = initialSource ? SOURCE_BY_SLUG.get(initialSource) : undefined;
  const samples = lockedSource?.sampleQueries ?? DEFAULT_SAMPLES;

  let summary: React.ReactNode = "Results";
  if (shouldSearch && !searchLoading && !searchError) {
    summary = results.totalHits > 0
      ? <><strong className="font-semibold text-ink">{results.totalHits.toLocaleString("en-US")}</strong> {results.totalHits === 1 ? "result" : "results"}{state.q ? <> for &ldquo;{state.q}&rdquo;</> : null}</>
      : "No results";
  } else if (shouldSearch && searchLoading && !hasResults) {
    summary = "Searching…";
  } else if (hasResults) {
    summary = <><strong className="font-semibold text-ink">{results.totalHits.toLocaleString("en-US")}</strong> {results.totalHits === 1 ? "result" : "results"}</>;
  }

  return (
    <div className="grid gap-x-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <SearchFilters
        filters={filters}
        hasFilters={filterCount > 0}
        lockedSource={initialSource}
        mobileOpen={filtersOpen}
        mobileTriggerRef={filtersTriggerRef}
        onChange={navigate}
        onClear={clearFilters}
        onMobileOpenChange={setFiltersOpen}
        state={state}
      />

      <section aria-label="Search results" className="min-w-0">
        <div className="sticky top-[var(--header-height)] z-30 -mx-4 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput label={lockedSource ? `Search ${lockedSource.name}` : undefined} onChange={setDraftQuery} onSubmit={submitQuery} placeholder={lockedSource ? `Search ${lockedSource.shortName}…` : undefined} suggestions={suggestions} suggestionsLoading={suggestionsLoading} value={draftQuery} />
            <div className="flex gap-2">
              <button className="button-quiet flex-1 px-3 lg:hidden" onClick={() => setFiltersOpen(true)} ref={filtersTriggerRef} type="button">
                <ListFilter aria-hidden className="h-4 w-4" />
                Filters
                {filterCount ? <span className="grid h-5 min-w-5 place-items-center bg-ink px-1 font-mono text-2xs text-paper" style={{ borderRadius: 2 }}>{filterCount}</span> : null}
              </button>
              <label className="relative flex-1 sm:flex-none">
                <span className="sr-only">Sort results</span>
                <select className="field h-11 w-full cursor-pointer appearance-none pr-8 font-medium sm:w-40" onChange={(event) => navigate({ sort: event.target.value as SearchState["sort"], page: 1 })} value={state.sort}>
                  <option value="relevance">By relevance</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <svg aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-soft" viewBox="0 0 12 12"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              </label>
            </div>
          </div>

          {filterCount || lockedSource ? (
            <ul aria-label="Active filters" className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {lockedSource ? (
                <li className="chip pr-2.5" data-source={initialSource}>
                  <span aria-hidden className="mr-0.5 h-3.5 w-1.5 bg-cloth" />
                  {lockedSource.shortName}
                  <Lock aria-hidden className="ml-1 h-3 w-3 text-ink-faint" />
                  <span className="sr-only"> (fixed for this workspace)</span>
                </li>
              ) : state.source.map((value) => <FilterChip key={`source-${value}`} label={SOURCE_BY_SLUG.get(value)?.shortName ?? value} onRemove={() => navigate({ source: state.source.filter((item) => item !== value), page: 1 })} source={value} />)}
              {state.contentType.map((value) => <FilterChip key={`type-${value}`} label={CONTENT_LABELS[value]} onRemove={() => navigate({ contentType: state.contentType.filter((item) => item !== value), page: 1 })} />)}
              {state.language.map((value) => <FilterChip key={`language-${value}`} label={`Language: ${value}`} onRemove={() => navigate({ language: state.language.filter((item) => item !== value), page: 1 })} />)}
              {state.domain.map((value) => <FilterChip key={`domain-${value}`} label={value} onRemove={() => navigate({ domain: state.domain.filter((item) => item !== value), page: 1 })} />)}
              {state.tags.map((value) => <FilterChip key={`tag-${value}`} label={`Tag: ${value}`} onRemove={() => navigate({ tags: state.tags.filter((item) => item !== value), page: 1 })} />)}
              {state.updatedWithin ? <FilterChip label={`Updated within ${UPDATED_LABELS[state.updatedWithin as keyof typeof UPDATED_LABELS]}`} onRemove={() => navigate({ updatedWithin: null, page: 1 })} /> : null}
              {state.from ? <FilterChip label={`Published from ${state.from}`} onRemove={() => navigate({ from: null, page: 1 })} /> : null}
              {state.to ? <FilterChip label={`Published to ${state.to}`} onRemove={() => navigate({ to: null, page: 1 })} /> : null}
              {filterCount > 1 ? <li><button className="button-bare min-h-8 text-xs" onClick={clearFilters} type="button">Clear all</button></li> : null}
            </ul>
          ) : null}
        </div>

        <div className="flex min-h-12 items-center justify-between gap-3 text-sm text-ink-soft">
          <h2 aria-live="polite" className="min-w-0 break-words outline-none [overflow-wrap:anywhere]" ref={resultsHeadingRef} tabIndex={-1}>{summary}</h2>
          <p className="flex items-center gap-2 text-xs">
            {updating ? <span className="inline-flex items-center gap-1.5" role="status"><LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />Updating</span> : null}
            {hasResults && !updating ? <span className="font-mono">{formatDuration(results.processingTimeMs)}</span> : null}
          </p>
        </div>

        {filterError ? (
          <p className="notice mb-3 text-xs"><TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />Filter counts could not be loaded. Filters still work; counts are hidden.</p>
        ) : null}
        {results.mode === "demo" ? (
          <p className="notice mb-3 text-xs"><TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />Demo mode: these results come from a small bundled sample, not the crawled index.</p>
        ) : null}
        {searchError ? <div className="mb-3"><SearchError hasResults={hasResults} message={searchError} onRetry={() => setRetryKey((value) => value + 1)} /></div> : null}

        <div className={`border-t border-rule-strong transition-opacity duration-150 ${updating ? "opacity-60" : ""}`}>
          {searchLoading && !hasResults ? <ResultsSkeleton />
            : hasResults ? results.results.map((result, index) => {
              const rank = (state.page - 1) * state.limit + index + 1;
              return <ResultEntry indexRevision={results.indexRevision} key={result.id} onTrackClick={() => trackClick(result, rank)} rank={rank} result={result} />;
            })
            : searchError ? null
            : shouldSearch ? <NoResults filtered={filterCount > 0} onClearFilters={clearFilters} onSearch={submitQuery} query={state.q} suggestions={results.recoverySuggestions} />
            : <SearchPrompt onSearch={submitQuery} samples={samples} sourceName={lockedSource?.shortName} />}
        </div>

        {hasResults ? <div className="mt-2"><Pagination onPageChange={(page) => navigate({ page })} page={state.page} response={results} /></div> : null}
      </section>
    </div>
  );
}

function FilterChip({ label, source, onRemove }: { label: string; source?: string; onRemove: () => void }) {
  return (
    <li className="chip" data-source={source}>
      {source ? <span aria-hidden className="mr-0.5 h-3.5 w-1.5 bg-cloth" /> : null}
      {label}
      <button aria-label={`Remove filter: ${label}`} className="inline-grid h-8 w-7 place-items-center text-ink-soft hover:text-ink" onClick={onRemove} type="button"><X aria-hidden className="h-3.5 w-3.5" /></button>
    </li>
  );
}
