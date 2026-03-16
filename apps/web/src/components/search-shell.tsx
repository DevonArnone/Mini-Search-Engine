"use client";

import { useEffect, useState, useTransition } from "react";
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
  results: [],
};

function toggle(values: string[], next: string) {
  return values.includes(next)
    ? values.filter((value) => value !== next)
    : [...values, next];
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
  const [isPending, startTransition] = useTransition();
  const debouncedQuery = useDebounce(state.q, 250);

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
      const [searchResponse, filtersResponse, autocompleteResponse] = await Promise.all([
        fetch(`/api/search?${searchParams.toString()}`, { signal: controller.signal }).then((res) =>
          res.json(),
        ),
        fetch("/api/filters", { signal: controller.signal }).then((res) => res.json()),
        fetch(`/api/autocomplete?q=${encodeURIComponent(debouncedQuery)}`, {
          signal: controller.signal,
        }).then((res) => res.json()),
      ]);
      setResults(searchResponse);
      setFilters(filtersResponse);
      setSuggestions(autocompleteResponse.suggestions ?? []);
    };

    void fetchData();
    return () => controller.abort();
  }, [debouncedQuery, pathname, router, state]);

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
            <div className="relative flex-1">
              <input
                aria-label="Search query"
                className="w-full rounded-2xl border border-orange-200 bg-sand px-4 py-3 text-ink outline-none ring-0 placeholder:text-stone-500"
                onChange={(event) =>
                  setState((current) => ({ ...current, q: event.target.value, page: 1 }))
                }
                placeholder="Search docs, blogs, and knowledge bases"
                value={state.q}
              />
              {suggestions.length > 0 && state.q ? (
                <div className="absolute z-10 mt-2 w-full rounded-2xl border border-orange-100 bg-white p-2 shadow-lg">
                  {suggestions.map((suggestion) => (
                    <button
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-orange-50"
                      key={suggestion}
                      onClick={() =>
                        setState((current) => ({ ...current, q: suggestion, page: 1 }))
                      }
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

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
                <a className="mt-1 block break-all text-sm text-ember" href={result.url}>
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
