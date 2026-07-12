"use client";

import { X } from "lucide-react";
import React, { useEffect } from "react";

import { SOURCE_DEFINITIONS } from "@/lib/sources";
import type { ContentType, FiltersResponse, SearchState } from "@/types/search";

const CONTENT_LABELS: Record<ContentType, string> = {
  guide: "Guide",
  reference: "Reference",
  tutorial: "Tutorial",
  api: "API",
  blog: "Blog",
};

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function FilterList({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string; count: number }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <fieldset className="border-b border-line pb-5 last:border-0 last:pb-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</legend>
      <div className="space-y-0.5">
        {options.map((option) => (
          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded px-2 text-sm hover:bg-slate-50" key={option.value}>
            <span className="flex min-w-0 items-center gap-2.5">
              <input
                checked={selected.includes(option.value)}
                className="h-4 w-4 rounded border-line-strong accent-teal-700"
                onChange={() => onToggle(option.value)}
                type="checkbox"
              />
              <span className="truncate">{option.label}</span>
            </span>
            {option.count > 0 ? <span className="font-mono text-[11px] text-slate-600">{option.count.toLocaleString()}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterContent({
  filters,
  state,
  onChange,
  onClear,
}: {
  filters: FiltersResponse;
  state: SearchState;
  onChange: (patch: Partial<SearchState>) => void;
  onClear: () => void;
}) {
  const sourceCounts = new Map(filters.sources.map((source) => [source.value, source.count]));
  const sourceOptions = SOURCE_DEFINITIONS.map((source) => ({
    value: source.slug,
    label: source.shortName,
    count: sourceCounts.get(source.slug) ?? 0,
  }));

  return (
    <>
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <h2 className="text-sm font-semibold text-ink">Filters</h2>
        <button className="button-ghost min-h-8 px-2 text-xs" onClick={onClear} type="button">Clear all</button>
      </div>
      <div className="space-y-5 p-4">
        <FilterList
          label="Source"
          onToggle={(value) => onChange({ source: toggle(state.source, value), page: 1 })}
          options={sourceOptions}
          selected={state.source}
        />
        <FilterList
          label="Content type"
          onToggle={(value) => onChange({ contentType: toggle(state.contentType, value) as ContentType[], page: 1 })}
          options={filters.contentTypes.map((option) => ({ ...option, label: CONTENT_LABELS[option.value as ContentType] ?? option.value }))}
          selected={state.contentType}
        />
        <fieldset className="border-b border-line pb-5">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Updated within</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(["7d", "30d", "90d"] as const).map((period) => (
              <button
                aria-pressed={state.updatedWithin === period}
                className={`min-h-9 rounded-md border px-2 text-xs font-medium ${state.updatedWithin === period ? "border-teal-300 bg-teal-50 text-teal-800" : "border-line bg-white text-muted hover:bg-slate-50"}`}
                key={period}
                onClick={() => onChange({ updatedWithin: state.updatedWithin === period ? null : period, page: 1 })}
                type="button"
              >
                {period.replace("d", " days")}
              </button>
            ))}
          </div>
        </fieldset>
        <FilterList
          label="Language"
          onToggle={(value) => onChange({ language: toggle(state.language, value), page: 1 })}
          options={filters.languages.slice(0, 8).map((option) => ({ ...option, label: option.value }))}
          selected={state.language}
        />
      </div>
    </>
  );
}

export function SearchFilters({
  filters,
  state,
  mobileOpen,
  onChange,
  onClear,
  onClose,
}: {
  filters: FiltersResponse;
  state: SearchState;
  mobileOpen: boolean;
  onChange: (patch: Partial<SearchState>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileOpen, onClose]);

  return (
    <>
      <aside className="panel hidden overflow-hidden lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:block lg:self-start" aria-label="Search filters">
        <FilterContent filters={filters} onChange={onChange} onClear={onClear} state={state} />
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
          <button aria-label="Close filters" className="absolute inset-0 bg-ink/30" onClick={onClose} type="button" />
          <div aria-label="Search filters" aria-modal="true" className="absolute inset-y-0 right-0 w-[min(90vw,360px)] overflow-y-auto bg-white shadow-panel" role="dialog">
            <button aria-label="Close filters" className="icon-button absolute right-2 top-1 z-10" onClick={onClose} type="button">
              <X aria-hidden className="h-5 w-5" />
            </button>
            <FilterContent filters={filters} onChange={onChange} onClear={onClear} state={state} />
          </div>
        </div>
      ) : null}
    </>
  );
}

export { CONTENT_LABELS };
