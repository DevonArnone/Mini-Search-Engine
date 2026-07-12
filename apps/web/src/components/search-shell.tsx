"use client";

import type { Route } from "next";
import { Filter, LoaderCircle, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { SearchFilters, CONTENT_LABELS } from "@/components/search-filters";
import { SearchInput } from "@/components/search-input";
import { Pagination, ResultCard, ResultsSkeleton, SearchEmptyState, SearchError } from "@/components/search-results";
import { useDebounce } from "@/hooks/use-debounce";
import { SOURCE_BY_SLUG } from "@/lib/sources";
import { parseSearchState, toSearchParams } from "@/lib/url-state";
import type { FiltersResponse, SearchResponse, SearchResult, SearchState } from "@/types/search";

const EMPTY_FILTERS: FiltersResponse = { sources: [], contentTypes: [], domains: [], languages: [], tags: [], dateBuckets: [] };
const EMPTY_RESULTS: SearchResponse = { query: "", page: 1, limit: 10, totalHits: 0, processingTimeMs: 0, mode: "live", results: [] };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function activeFilterCount(state: SearchState) {
  return state.source.length + state.contentType.length + state.domain.length + state.language.length + state.tags.length + (state.updatedWithin ? 1 : 0);
}

export function SearchShell({ initialSource }: { initialSource?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const [navigationPending, startTransition] = useTransition();
  const state = useMemo(() => {
    const parsed = parseSearchState(new URLSearchParams(paramsKey));
    if (initialSource && parsed.source.length === 0) parsed.source = [initialSource];
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

  useEffect(() => setDraftQuery(state.q), [state.q]);

  const navigate = useCallback((patch: Partial<SearchState>, scroll = false) => {
    const next = { ...state, ...patch };
    const query = toSearchParams(next).toString();
    startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, { scroll }));
  }, [pathname, router, state]);

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

  useEffect(() => {
    const shouldSearch = Boolean(state.q || activeFilterCount(state));
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
          navigate({ page: totalPages });
          return;
        }
        setResults(nextResults);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "Search is temporarily unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });
    return () => controller.abort();
  }, [navigate, retryKey, state, stateKey]);

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

  function trackClick(result: SearchResult, resultRank: number) {
    if (!results.searchId || !isUuid(result.id)) return;
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ searchId: results.searchId, clickedDocumentId: result.id, resultRank }),
    }).catch(() => undefined);
  }

  const filterCount = activeFilterCount(state);
  const hasResults = results.results.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <SearchFilters filters={filters} mobileOpen={filtersOpen} onChange={(patch) => { navigate(patch); setFiltersOpen(false); }} onClear={clearFilters} onClose={() => setFiltersOpen(false)} state={state} />

      <section aria-label="Search results" className="min-w-0">
        <div className="panel sticky top-[calc(var(--header-height)+0.75rem)] z-30 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput onChange={setDraftQuery} onSubmit={submitQuery} suggestions={suggestions} suggestionsLoading={suggestionsLoading} value={draftQuery} />
            <div className="flex gap-2">
              <button className="button-secondary flex-1 lg:hidden" onClick={() => setFiltersOpen(true)} type="button">
                <Filter aria-hidden className="h-4 w-4" />Filters{filterCount ? <span className="badge bg-teal-100 text-teal-800">{filterCount}</span> : null}
              </button>
              <label className="relative flex-1 sm:flex-none">
                <span className="sr-only">Sort results</span>
                <SlidersHorizontal aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select className="control h-11 w-full appearance-none pl-9 pr-8 sm:w-36" onChange={(event) => navigate({ sort: event.target.value as SearchState["sort"], page: 1 })} value={state.sort}>
                  <option value="relevance">Relevance</option>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </label>
            </div>
          </div>
          {filterCount ? (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
              {state.source.map((value) => <FilterChip key={`source-${value}`} label={SOURCE_BY_SLUG.get(value)?.shortName ?? value} onRemove={() => navigate({ source: state.source.filter((item) => item !== value), page: 1 })} />)}
              {state.contentType.map((value) => <FilterChip key={`type-${value}`} label={CONTENT_LABELS[value]} onRemove={() => navigate({ contentType: state.contentType.filter((item) => item !== value), page: 1 })} />)}
              {state.language.map((value) => <FilterChip key={`language-${value}`} label={value} onRemove={() => navigate({ language: state.language.filter((item) => item !== value), page: 1 })} />)}
              {state.domain.map((value) => <FilterChip key={`domain-${value}`} label={value} onRemove={() => navigate({ domain: state.domain.filter((item) => item !== value), page: 1 })} />)}
              {state.tags.map((value) => <FilterChip key={`tag-${value}`} label={value} onRemove={() => navigate({ tags: state.tags.filter((item) => item !== value), page: 1 })} />)}
              {state.updatedWithin ? <FilterChip label={`Updated ${state.updatedWithin.replace("d", " days")}`} onRemove={() => navigate({ updatedWithin: null, page: 1 })} /> : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex min-h-7 items-center justify-between gap-3 text-sm text-muted">
          <h2 className="outline-none" ref={resultsHeadingRef} tabIndex={-1}>
            {results.totalHits > 0 ? <><strong className="font-semibold text-ink">{results.totalHits.toLocaleString()}</strong> {results.totalHits === 1 ? "result" : "results"} <span className="text-slate-600">in {results.processingTimeMs}ms</span></> : state.q ? `Results for “${state.q}”` : "Search results"}
          </h2>
          {(searchLoading || navigationPending) && hasResults ? <span className="inline-flex items-center gap-1.5 text-xs"><LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />Updating</span> : null}
        </div>

        {filterError ? <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Live facet counts are unavailable. Known source filters remain usable.</div> : null}
        {results.mode === "demo" ? <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Demo mode is enabled. Results come from the bundled sample index.</div> : null}
        {searchError ? <div className="mt-3"><SearchError hasResults={hasResults} message={searchError} onRetry={() => setRetryKey((value) => value + 1)} /></div> : null}

        <div className="mt-3 space-y-3">
          {searchLoading && !hasResults ? <ResultsSkeleton /> : hasResults ? results.results.map((result, index) => {
            const rank = (state.page - 1) * state.limit + index + 1;
            return <ResultCard key={result.id} onTrackClick={() => trackClick(result, rank)} rank={rank} result={result} />;
          }) : !searchError ? <SearchEmptyState onSearch={submitQuery} query={state.q} suggestions={results.recoverySuggestions} /> : null}
        </div>

        {hasResults ? <div className="mt-5"><Pagination onPageChange={(page) => navigate({ page })} page={state.page} response={results} /></div> : null}
      </section>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="badge border border-teal-200 bg-teal-50 text-teal-900">
      {label}
      <button aria-label={`Remove ${label} filter`} className="rounded-sm hover:bg-teal-100" onClick={onRemove} type="button"><X aria-hidden className="h-3.5 w-3.5" /></button>
    </span>
  );
}
