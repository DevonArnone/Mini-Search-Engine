"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDebounce } from "@/hooks/use-debounce";
import { parseSearchState, toSearchParams } from "@/lib/url-state";
import type { ContentType, FiltersResponse, SearchResponse, SearchResult, SearchState } from "@/types/search";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultFilters: FiltersResponse = {
  sources: [],
  contentTypes: [],
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toggle<T>(values: T[], next: T) {
  return values.includes(next) ? values.filter((v) => v !== next) : [...values, next];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const SOURCE_LABELS: Record<string, string> = {
  mdn: "MDN",
  react: "React",
  nextjs: "Next.js",
  typescript: "TypeScript",
  postgresql: "PostgreSQL",
};

const SOURCE_COLORS: Record<string, string> = {
  mdn: "bg-blue-100 text-blue-800",
  react: "bg-cyan-100 text-cyan-800",
  nextjs: "bg-stone-100 text-stone-800",
  typescript: "bg-indigo-100 text-indigo-800",
  postgresql: "bg-teal-100 text-teal-800",
};

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  guide: "Guide",
  reference: "Reference",
  tutorial: "Tutorial",
  api: "API",
  blog: "Blog",
};

function sourceBadge(slug: string | null) {
  if (!slug) return null;
  const label = SOURCE_LABELS[slug] ?? slug;
  const color = SOURCE_COLORS[slug] ?? "bg-orange-100 text-orange-800";
  return { label, color };
}

function freshnessLabel(status: SearchResult["freshnessStatus"]) {
  if (status === "fresh") return { text: "Updated recently", color: "text-emerald-600" };
  if (status === "ok") return { text: "Indexed", color: "text-stone-500" };
  if (status === "stale") return { text: "Stale", color: "text-amber-600" };
  return null;
}

// ---------------------------------------------------------------------------
// SearchBar component
// ---------------------------------------------------------------------------

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.length) setIsOpen(false);
    setFocusedIndex(-1);
  }, [query]);

  const openSuggestions = isOpen && suggestions.length > 0 && query.length > 0;

  return (
    <div className="relative flex-1" ref={searchRef}>
      <div className="relative">
        <svg
          aria-hidden
          className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx={11} cy={11} r={8} />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          aria-autocomplete="list"
          aria-controls={openSuggestions ? "suggestions-list" : undefined}
          aria-expanded={openSuggestions}
          aria-label="Search developer documentation"
          className="w-full rounded-2xl border border-orange-200 bg-sand py-3 pl-11 pr-4 text-ink outline-none ring-ocean focus:ring-2 placeholder:text-stone-400"
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setIsOpen(nextQuery.trim().length > 0);
          }}
          onKeyDown={(event) => {
            if (!openSuggestions) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setFocusedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setFocusedIndex((prev) => Math.max(prev - 1, -1));
            } else if (event.key === "Enter" && focusedIndex >= 0) {
              setQuery(suggestions[focusedIndex]);
              setIsOpen(false);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder="Search docs — try 'useState', 'async/await', 'SQL joins'"
          ref={inputRef}
          role="combobox"
          value={query}
        />
      </div>
      {openSuggestions ? (
        <ul
          className="absolute z-20 mt-2 w-full rounded-2xl border border-orange-100 bg-white p-2 shadow-xl"
          id="suggestions-list"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion} role="option" aria-selected={focusedIndex === index}>
              <button
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${
                  focusedIndex === index ? "bg-orange-50 text-ink" : "text-stone-700 hover:bg-orange-50"
                }`}
                onClick={() => {
                  setQuery(suggestion);
                  setIsOpen(false);
                  inputRef.current?.focus();
                }}
                type="button"
              >
                <svg
                  aria-hidden
                  className="h-3.5 w-3.5 text-stone-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <circle cx={11} cy={11} r={8} />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active filter chips
// ---------------------------------------------------------------------------

function FilterChips({
  state,
  setState,
  filters,
}: {
  state: SearchState;
  setState: React.Dispatch<React.SetStateAction<SearchState>>;
  filters: FiltersResponse;
}) {
  const chips: { label: string; onRemove: () => void }[] = [];

  for (const s of state.source) {
    chips.push({
      label: SOURCE_LABELS[s] ?? s,
      onRemove: () => setState((c) => ({ ...c, source: toggle(c.source, s), page: 1 })),
    });
  }
  for (const ct of state.contentType) {
    chips.push({
      label: CONTENT_TYPE_LABELS[ct] ?? ct,
      onRemove: () => setState((c) => ({ ...c, contentType: toggle(c.contentType, ct), page: 1 })),
    });
  }
  for (const d of state.domain) {
    chips.push({
      label: d,
      onRemove: () => setState((c) => ({ ...c, domain: toggle(c.domain, d), page: 1 })),
    });
  }
  if (state.updatedWithin) {
    const label = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" }[state.updatedWithin] ?? state.updatedWithin;
    chips.push({
      label,
      onRemove: () => setState((c) => ({ ...c, updatedWithin: null, page: 1 })),
    });
  }

  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-ocean/10 px-3 py-1 text-xs font-medium text-ocean"
          key={chip.label}
        >
          {chip.label}
          <button
            aria-label={`Remove ${chip.label} filter`}
            className="hover:text-ink"
            onClick={chip.onRemove}
            type="button"
          >
            ×
          </button>
        </span>
      ))}
      <button
        className="text-xs text-stone-500 hover:text-ink"
        onClick={() =>
          setState((c) => ({
            ...c,
            source: [],
            contentType: [],
            domain: [],
            language: [],
            tags: [],
            from: null,
            to: null,
            updatedWithin: null,
            page: 1,
          }))
        }
        type="button"
      >
        Clear all
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter sidebar
// ---------------------------------------------------------------------------

function FilterSidebar({
  filters,
  state,
  setState,
}: {
  filters: FiltersResponse;
  state: SearchState;
  setState: React.Dispatch<React.SetStateAction<SearchState>>;
}) {
  return (
    <aside className="rounded-3xl border border-orange-200 bg-white/80 p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-ink">Filters</h2>
        <button
          className="text-xs text-ocean hover:underline"
          onClick={() =>
            setState((c) => ({
              ...c,
              source: [],
              contentType: [],
              domain: [],
              language: [],
              tags: [],
              from: null,
              to: null,
              updatedWithin: null,
              page: 1,
            }))
          }
          type="button"
        >
          Clear
        </button>
      </div>

      {/* Source filter */}
      <FilterSection
        title="Source"
        options={filters.sources.map((s) => ({ ...s, label: SOURCE_LABELS[s.value] ?? s.value }))}
        selected={state.source}
        onToggle={(value) => setState((c) => ({ ...c, source: toggle(c.source, value), page: 1 }))}
      />

      {/* Content type filter */}
      <FilterSection
        title="Content type"
        options={filters.contentTypes.map((ct) => ({
          ...ct,
          label: CONTENT_TYPE_LABELS[ct.value as ContentType] ?? ct.value,
        }))}
        selected={state.contentType}
        onToggle={(value) =>
          setState((c) => ({
            ...c,
            contentType: toggle(c.contentType, value as ContentType),
            page: 1,
          }))
        }
      />

      {/* Updated recently */}
      <div className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Updated within
        </h3>
        <div className="space-y-1.5">
          {(["7d", "30d", "90d"] as const).map((period) => {
            const labels = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };
            return (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700" key={period}>
                <input
                  checked={state.updatedWithin === period}
                  className="accent-ocean"
                  onChange={() =>
                    setState((c) => ({
                      ...c,
                      updatedWithin: c.updatedWithin === period ? null : period,
                      page: 1,
                    }))
                  }
                  type="radio"
                />
                {labels[period]}
              </label>
            );
          })}
        </div>
      </div>

      {/* Language */}
      {filters.languages.length > 0 && (
        <FilterSection
          title="Language"
          options={filters.languages.map((l) => ({ ...l, label: l.value }))}
          selected={state.language}
          onToggle={(value) =>
            setState((c) => ({ ...c, language: toggle(c.language, value), page: 1 }))
          }
        />
      )}
    </aside>
  );
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { value: string; count: number; label?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            className="flex cursor-pointer items-center justify-between gap-2 text-sm"
            key={option.value}
          >
            <span className="flex items-center gap-2 text-stone-700">
              <input
                checked={selected.includes(option.value)}
                className="accent-ocean"
                onChange={() => onToggle(option.value)}
                type="checkbox"
              />
              {option.label ?? option.value}
            </span>
            <span className="text-xs text-stone-400">{option.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function ResultCard({
  result,
  onTrackClick,
}: {
  result: SearchResult;
  onTrackClick: () => void;
}) {
  const badge = sourceBadge(result.sourceSlug);
  const freshness = freshnessLabel(result.freshnessStatus);
  const updatedDate = result.lastUpdatedAt
    ? new Date(result.lastUpdatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <article className="rounded-[2rem] border border-orange-200 bg-white/85 p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Source + content type badges */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {badge ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>
            {badge.label}
          </span>
        ) : null}
        {result.contentType ? (
          <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs text-orange-700">
            {CONTENT_TYPE_LABELS[result.contentType] ?? result.contentType}
          </span>
        ) : null}
        {result.codeBlockCount > 0 ? (
          <span className="rounded-full bg-stone-50 px-2.5 py-0.5 text-xs text-stone-500">
            {result.codeBlockCount} code {result.codeBlockCount === 1 ? "example" : "examples"}
          </span>
        ) : null}
      </div>

      {/* Section path / breadcrumb */}
      {result.sectionPath ? (
        <p className="mb-1 truncate text-xs text-stone-400">{result.sectionPath}</p>
      ) : null}

      <h3 className="font-display text-lg font-semibold leading-snug text-ink">{result.title}</h3>

      <a
        className="mt-1 block truncate text-xs text-ember hover:underline"
        href={result.url}
        onClick={onTrackClick}
        rel="noopener noreferrer"
        target="_blank"
      >
        {result.url}
      </a>

      <p
        className="mt-2.5 text-sm leading-6 text-stone-600"
        dangerouslySetInnerHTML={{ __html: result.snippet }}
      />

      {/* Footer row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {result.tags.slice(0, 4).map((tag) => (
            <span
              className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs text-teal-700"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {updatedDate ? (
            <span className="text-xs text-stone-400">Updated {updatedDate}</span>
          ) : null}
          {freshness ? (
            <span className={`text-xs font-medium ${freshness.color}`}>{freshness.text}</span>
          ) : null}
          {result.whyMatched.length > 0 ? (
            <span className="text-xs text-stone-400">
              Matched in {result.whyMatched.join(", ")}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Skeletons / empty states
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="rounded-[2rem] border border-orange-200 bg-white/80 p-5" key={i}>
          <div className="flex gap-2">
            <div className="h-5 w-14 animate-pulse rounded-full bg-orange-100" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-orange-100" />
          </div>
          <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-orange-100" />
          <div className="mt-2 h-3.5 w-64 animate-pulse rounded bg-orange-50" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-orange-50" />
          <div className="mt-1.5 h-4 w-5/6 animate-pulse rounded bg-orange-50" />
        </div>
      ))}
    </div>
  );
}

function NoResults({
  query,
  suggestions,
  onSuggestionClick,
}: {
  query: string;
  suggestions?: string[];
  onSuggestionClick: (q: string) => void;
}) {
  return (
    <div className="rounded-[2rem] border border-dashed border-orange-300 bg-white/60 p-10 text-center">
      <h3 className="font-display text-2xl text-ink">No results found</h3>
      <p className="mt-2 text-sm text-stone-500">
        {query
          ? `No documentation matched "${query}". Try a broader term or remove a filter.`
          : "Start typing to search across developer documentation."}
      </p>
      {suggestions && suggestions.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Try one of these
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-orange-300 hover:bg-orange-50"
                key={s}
                onClick={() => onSuggestionClick(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SearchShell
// ---------------------------------------------------------------------------

export function SearchShell({ initialSource }: { initialSource?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialState = parseSearchState(params);
  // Pre-select source if navigated from a source page
  if (initialSource && !initialState.source.includes(initialSource)) {
    initialState.source = [initialSource];
  }

  const [state, setState] = useState<SearchState>(initialState);
  const [results, setResults] = useState<SearchResponse>(defaultResults);
  const [filters, setFilters] = useState<FiltersResponse>(defaultFilters);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debouncedQuery = useDebounce(state.q, 250);
  const lastAnalyticsKeyRef = useRef<string | null>(null);

  // Sync URL params → state when the URL changes (back/forward navigation)
  useEffect(() => {
    setState(parseSearchState(params));
  }, [params]);

  // Main data fetch — re-runs whenever any filter or query changes
  useEffect(() => {
    const controller = new AbortController();
    const next = { ...state, q: debouncedQuery, page: state.page || 1 };
    const searchParams = toSearchParams(next);

    startTransition(() => {
      router.replace(`${pathname}?${searchParams.toString()}` as Route);
    });

    const fetchData = async () => {
      try {
        setError(null);
        const [searchResponse, filtersResponse, autocompleteResponse] = await Promise.all([
          fetch(`/api/search?${searchParams.toString()}`, { signal: controller.signal }).then((r) => {
            if (!r.ok) throw new Error("Search request failed");
            return r.json() as Promise<SearchResponse>;
          }),
          fetch("/api/filters", { signal: controller.signal }).then((r) => {
            if (!r.ok) throw new Error("Filters request failed");
            return r.json() as Promise<FiltersResponse>;
          }),
          fetch(`/api/autocomplete?q=${encodeURIComponent(debouncedQuery)}`, {
            signal: controller.signal,
          }).then((r) => {
            if (!r.ok) throw new Error("Autocomplete request failed");
            return r.json() as Promise<{ suggestions: string[] }>;
          }),
        ]);
        setResults(searchResponse);
        setFilters(filtersResponse);
        setSuggestions(autocompleteResponse.suggestions ?? []);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setError(
          fetchError instanceof Error ? fetchError.message : "Search is temporarily unavailable.",
        );
      }
    };

    void fetchData();
    return () => controller.abort();
  }, [debouncedQuery, pathname, router, state]);

  // Analytics view event (deduplicated)
  useEffect(() => {
    if (results.mode !== "live") return;
    const key = JSON.stringify({
      q: state.q,
      page: state.page,
      sort: state.sort,
      source: state.source,
      contentType: state.contentType,
      totalHits: results.totalHits,
    });
    if (lastAnalyticsKeyRef.current === key) return;
    lastAnalyticsKeyRef.current = key;
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: state.q,
        filters: {
          source: state.source,
          contentType: state.contentType,
          domain: state.domain,
          language: state.language,
          tags: state.tags,
          sort: state.sort,
          page: state.page,
          from: state.from,
          to: state.to,
          updatedWithin: state.updatedWithin,
        },
        resultsCount: results.totalHits,
        latencyMs: results.processingTimeMs,
      }),
    }).catch(() => undefined);
  }, [results, state]);

  function trackClick(result: SearchResult) {
    if (results.mode !== "live") return;
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        query: state.q,
        filters: { source: state.source, contentType: state.contentType, domain: state.domain },
        resultsCount: results.totalHits,
        latencyMs: results.processingTimeMs,
        clickedDocumentId: isUuid(result.id) ? result.id : null,
      }),
    }).catch(() => undefined);
  }

  const hasActiveFilters =
    state.source.length > 0 ||
    state.contentType.length > 0 ||
    state.domain.length > 0 ||
    state.language.length > 0 ||
    state.tags.length > 0 ||
    Boolean(state.updatedWithin);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Sidebar */}
      <FilterSidebar filters={filters} state={state} setState={setState} />

      {/* Main content */}
      <section className="min-w-0 space-y-4">
        {/* Sticky search bar */}
        <div className="sticky top-[60px] z-30 rounded-[2rem] border border-orange-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <SearchBar
              query={state.q}
              setQuery={(q) => setState((c) => ({ ...c, q, page: 1 }))}
              suggestions={suggestions}
            />
            <select
              aria-label="Sort results"
              className="rounded-2xl border border-orange-200 bg-sand px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ocean"
              onChange={(e) =>
                setState((c) => ({ ...c, sort: e.target.value as SearchState["sort"], page: 1 }))
              }
              value={state.sort}
            >
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters ? (
            <div className="mt-3">
              <FilterChips filters={filters} setState={setState} state={state} />
            </div>
          ) : null}
        </div>

        {/* Results meta */}
        <div className="flex items-center justify-between px-1 text-sm text-stone-500">
          <p>
            {results.totalHits > 0
              ? `${results.totalHits.toLocaleString()} result${results.totalHits === 1 ? "" : "s"} in ${results.processingTimeMs}ms`
              : "Ready to search"}
          </p>
          {isPending ? <p className="text-xs text-ocean">Updating…</p> : null}
        </div>

        {/* Demo mode warning */}
        {results.mode === "demo" ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
            {results.warning ?? "Demo mode — Meilisearch is unavailable. Showing bundled sample results."}
          </div>
        ) : null}

        {/* Error */}
        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        {/* Results list */}
        {isPending && results.results.length === 0 ? (
          <SkeletonList />
        ) : results.results.length ? (
          <div className="space-y-4">
            {results.results.map((result) => (
              <ResultCard
                key={result.id}
                onTrackClick={() => trackClick(result)}
                result={result}
              />
            ))}
          </div>
        ) : (
          <NoResults
            onSuggestionClick={(q) => setState((c) => ({ ...c, q, page: 1 }))}
            query={state.q}
            suggestions={results.recoverySuggestions}
          />
        )}

        {/* Pagination */}
        {results.totalHits > 0 ? (
          <div className="flex items-center justify-between">
            <button
              className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm transition-colors hover:bg-orange-50 disabled:opacity-40"
              disabled={state.page <= 1}
              onClick={() => setState((c) => ({ ...c, page: c.page - 1 }))}
              type="button"
            >
              ← Previous
            </button>
            <p className="text-sm text-stone-500">Page {state.page}</p>
            <button
              className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm transition-colors hover:bg-orange-50 disabled:opacity-40"
              disabled={results.results.length < state.limit}
              onClick={() => setState((c) => ({ ...c, page: c.page + 1 }))}
              type="button"
            >
              Next →
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
