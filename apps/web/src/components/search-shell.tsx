"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDebounce } from "@/hooks/use-debounce";
import { parseSearchState, toSearchParams } from "@/lib/url-state";
import type { FiltersResponse, SearchResponse, SearchState } from "@/types/search";

const defaultFilters: FiltersResponse = {
  domains: [],
  languages: [],
  tags: [],
  dateBuckets: [],
};

const defaultResults: SearchResponse = {
  query: "",
  page: 1,
  limit: 10,
  totalHits: 0,
  processingTimeMs: 0,
  mode: "live",
  results: [],
};

function toggle(values: string[], next: string) {
  return values.includes(next)
    ? values.filter((value) => value !== next)
    : [...values, next];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function SearchBar({
  query,
  suggestions,
  setQuery,
}: {
  query: string;
  suggestions: string[];
  setQuery: (query: string) => void;
}) {
  const searchRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.length) {
      setIsOpen(false);
    }
  }, [query]);

  return (
    <div className="relative flex-1" ref={searchRef}>
      <input
        aria-label="Search query"
        className="w-full rounded-2xl border border-orange-200 bg-sand px-4 py-3 text-ink outline-none ring-0 placeholder:text-stone-500"
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(nextQuery.trim().length > 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            setIsOpen(false);
          }
        }}
        placeholder="Search docs, blogs, and knowledge bases"
        value={query}
      />
      {isOpen && suggestions.length > 0 && query.length > 0 ? (
        <div className="absolute z-10 mt-2 w-full rounded-2xl border border-orange-100 bg-white p-2 shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-orange-50"
              key={suggestion}
              onClick={() => {
                setQuery(suggestion);
                setIsOpen(false);
              }}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SearchShell() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialState = parseSearchState(params);
  const [state, setState] = useState<SearchState>(initialState);
  const [results, setResults] = useState<SearchResponse>(defaultResults);
  const [filters, setFilters] = useState<FiltersResponse>(defaultFilters);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debouncedQuery = useDebounce(state.q, 250);
  const lastAnalyticsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const nextState = parseSearchState(params);
    setState(nextState);
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    const next = { ...state, q: debouncedQuery, page: state.page || 1 };
    const searchParams = toSearchParams(next);

    startTransition(() => {
      const href = `${pathname}?${searchParams.toString()}` as Route;
      router.replace(href);
    });

    const fetchData = async () => {
      try {
        setError(null);
        const [searchResponse, filtersResponse, autocompleteResponse] = await Promise.all([
          fetch(`/api/search?${searchParams.toString()}`, { signal: controller.signal }).then(
            (res) => {
              if (!res.ok) {
                throw new Error("Search request failed");
              }
              return res.json();
            },
          ),
          fetch("/api/filters", { signal: controller.signal }).then((res) => {
            if (!res.ok) {
              throw new Error("Filter request failed");
            }
            return res.json();
          }),
          fetch(`/api/autocomplete?q=${encodeURIComponent(debouncedQuery)}`, {
            signal: controller.signal,
          }).then((res) => {
            if (!res.ok) {
              throw new Error("Autocomplete request failed");
            }
            return res.json();
          }),
        ]);
        setResults(searchResponse);
        setFilters(filtersResponse);
        setSuggestions(autocompleteResponse.suggestions ?? []);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Search is temporarily unavailable.",
        );
      }
    };

    void fetchData();
    return () => controller.abort();
  }, [debouncedQuery, pathname, router, state]);

  useEffect(() => {
    if (results.mode !== "live") {
      return;
    }

    const analyticsKey = JSON.stringify({
      q: state.q,
      page: state.page,
      sort: state.sort,
      domain: state.domain,
      language: state.language,
      tags: state.tags,
      totalHits: results.totalHits,
      processingTimeMs: results.processingTimeMs,
    });

    if (lastAnalyticsKeyRef.current === analyticsKey) {
      return;
    }
    lastAnalyticsKeyRef.current = analyticsKey;

    void fetch("/api/analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: state.q,
        filters: {
          domain: state.domain,
          language: state.language,
          tags: state.tags,
          sort: state.sort,
          page: state.page,
        },
        resultsCount: results.totalHits,
        latencyMs: results.processingTimeMs,
      }),
    }).catch(() => {
      // Search analytics should not disrupt the UI.
    });
  }, [results, state]);

  function trackClick(result: SearchResponse["results"][number]) {
    if (results.mode !== "live") {
      return;
    }

    void fetch("/api/analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify({
        query: state.q,
        filters: {
          domain: state.domain,
          language: state.language,
          tags: state.tags,
          sort: state.sort,
          page: state.page,
        },
        resultsCount: results.totalHits,
        latencyMs: results.processingTimeMs,
        clickedDocumentId: isUuid(result.id) ? result.id : null,
      }),
    }).catch(() => {
      // Click analytics should not block navigation.
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-orange-200 bg-white/80 p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Filters</h2>
          <button
            className="text-sm text-ocean"
            onClick={() =>
              setState((current) => ({
                ...current,
                domain: [],
                language: [],
                tags: [],
                page: 1,
              }))
            }
            type="button"
          >
            Clear
          </button>
        </div>

        <FilterSection
          title="Domain"
          options={filters.domains}
          selected={state.domain}
          onToggle={(value) =>
            setState((current) => ({ ...current, domain: toggle(current.domain, value), page: 1 }))
          }
        />
        <FilterSection
          title="Language"
          options={filters.languages}
          selected={state.language}
          onToggle={(value) =>
            setState((current) => ({
              ...current,
              language: toggle(current.language, value),
              page: 1,
            }))
          }
        />
        <FilterSection
          title="Tags"
          options={filters.tags}
          selected={state.tags}
          onToggle={(value) =>
            setState((current) => ({ ...current, tags: toggle(current.tags, value), page: 1 }))
          }
        />
      </aside>

      <section className="space-y-4">
        <div className="rounded-[2rem] border border-orange-200 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <SearchBar
              query={state.q}
              setQuery={(query) => setState((current) => ({ ...current, q: query, page: 1 }))}
              suggestions={suggestions}
            />

            <select
              aria-label="Sort results"
              className="rounded-2xl border border-orange-200 bg-sand px-4 py-3 text-sm"
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  sort: event.target.value as SearchState["sort"],
                  page: 1,
                }))
              }
              value={state.sort}
            >
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-sm text-stone-600">
          <p>
            {results.totalHits} results in {results.processingTimeMs}ms
          </p>
          {isPending ? <p>Updating…</p> : null}
        </div>

        {results.mode === "demo" ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            {results.warning ?? "Demo search mode is active."}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-950">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          {isPending && results.results.length === 0 ? (
            <SkeletonList />
          ) : results.results.length ? (
            results.results.map((result) => (
              <article
                className="rounded-[2rem] border border-orange-200 bg-white/85 p-5 shadow-sm"
                key={result.id}
              >
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-ocean">{result.domain}</p>
                <h3 className="font-display text-xl font-semibold text-ink">{result.title}</h3>
                <a
                  className="mt-1 block break-all text-sm text-ember"
                  href={result.url}
                  onClick={() => trackClick(result)}
                >
                  {result.url}
                </a>
                <p
                  className="mt-3 text-sm leading-6 text-stone-700"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.language ? (
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-900">
                      {result.language}
                    </span>
                  ) : null}
                  {result.tags.map((tag) => (
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-900" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[2rem] border border-dashed border-orange-300 bg-white/60 p-10 text-center">
              <h3 className="font-display text-2xl text-ink">No results found</h3>
              <p className="mt-2 text-sm text-stone-600">
                Try a broader query or remove one of the active filters.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            className="rounded-full border border-orange-200 px-4 py-2 text-sm disabled:opacity-40"
            disabled={state.page <= 1}
            onClick={() => setState((current) => ({ ...current, page: current.page - 1 }))}
            type="button"
          >
            Previous
          </button>
          <p className="text-sm text-stone-600">Page {state.page}</p>
          <button
            className="rounded-full border border-orange-200 px-4 py-2 text-sm disabled:opacity-40"
            disabled={results.results.length < state.limit}
            onClick={() => setState((current) => ({ ...current, page: current.page + 1 }))}
            type="button"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FiltersResponse["domains"];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <div className="space-y-2">
        {options.map((option) => (
          <label className="flex items-center justify-between gap-3 text-sm" key={option.value}>
            <span className="flex items-center gap-2">
              <input
                checked={selected.includes(option.value)}
                onChange={() => onToggle(option.value)}
                type="checkbox"
              />
              {option.value}
            </span>
            <span className="text-xs text-stone-500">{option.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="rounded-[2rem] border border-orange-200 bg-white/80 p-5" key={index}>
          <div className="h-3 w-24 animate-pulse rounded bg-orange-100" />
          <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-orange-100" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-orange-100" />
          <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-orange-100" />
        </div>
      ))}
    </div>
  );
}
