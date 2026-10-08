"use client";

import { Lock } from "lucide-react";
import React from "react";

import { Sheet } from "@/components/ui/sheet";
import { SOURCE_BY_SLUG, SOURCE_DEFINITIONS } from "@/lib/sources";
import type { ContentType, FiltersResponse, SearchState } from "@/types/search";

const CONTENT_LABELS: Record<ContentType, string> = {
  guide: "Guide",
  reference: "Reference",
  tutorial: "Tutorial",
  api: "API",
  blog: "Blog",
};

const UPDATED_LABELS = { "7d": "7 days", "30d": "30 days", "90d": "90 days" } as const;

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

interface Option {
  value: string;
  label: string;
  count: number;
  source?: string;
}

function FilterList({ label, options, selected, onToggle }: { label: string; options: Option[]; selected: string[]; onToggle: (value: string) => void }) {
  if (!options.length) return null;
  return (
    <fieldset className="border-t border-rule py-4 first:border-t-0 first:pt-0">
      <legend className="label float-left mb-1.5 w-full">{label}</legend>
      <div className="clear-both">
        {options.map((option) => (
          <label className="-mx-2 flex min-h-10 cursor-pointer items-center gap-2.5 px-2 text-sm text-ink transition-colors duration-150 hover:bg-paper-sunk" data-source={option.source} key={option.value} style={{ borderRadius: 2 }}>
            <input checked={selected.includes(option.value)} className="h-4 w-4 shrink-0 accent-[rgb(var(--ink))]" onChange={() => onToggle(option.value)} type="checkbox" />
            {option.source ? <span aria-hidden className="h-4 w-1.5 shrink-0 bg-cloth" /> : null}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.count > 0 ? <span className="measure text-ink-faint">{option.count.toLocaleString("en-US")}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterContent({
  filters,
  state,
  lockedSource,
  onChange,
  onClear,
  hasFilters,
}: {
  filters: FiltersResponse;
  state: SearchState;
  lockedSource?: string;
  onChange: (patch: Partial<SearchState>) => void;
  onClear: () => void;
  hasFilters: boolean;
}) {
  const sourceCounts = new Map(filters.sources.map((source) => [source.value, source.count]));
  const sourceOptions: Option[] = SOURCE_DEFINITIONS.map((source) => ({
    value: source.slug,
    label: source.shortName,
    count: sourceCounts.get(source.slug) ?? 0,
    source: source.slug,
  }));
  const locked = lockedSource ? SOURCE_BY_SLUG.get(lockedSource) : undefined;
  // Facet counts cover the whole index, so they are not shown inside a
  // workspace, where they would overstate what the source holds.
  const scoped = Boolean(lockedSource);

  return (
    <div>
      <div className="mb-3 flex min-h-8 items-center justify-between">
        <h2 className="font-display text-lg font-medium text-ink">Filters</h2>
        {hasFilters ? <button className="button-bare min-h-8" onClick={onClear} type="button">Clear all</button> : null}
      </div>

      {locked ? (
        <div className="border-t border-rule py-4" data-source={lockedSource}>
          <p className="label mb-1.5">Source</p>
          <p className="flex min-h-10 items-center gap-2.5 text-sm text-ink">
            <span aria-hidden className="h-4 w-1.5 shrink-0 bg-cloth" />
            <span className="flex-1">{locked.shortName}</span>
            <Lock aria-hidden className="h-3.5 w-3.5 text-ink-faint" />
          </p>
          <p className="text-xs text-ink-soft">This workspace only searches {locked.name}.</p>
        </div>
      ) : (
        <FilterList label="Source" onToggle={(value) => onChange({ source: toggle(state.source, value), page: 1 })} options={sourceOptions} selected={state.source} />
      )}

      <FilterList
        label="Content type"
        onToggle={(value) => onChange({ contentType: toggle(state.contentType, value) as ContentType[], page: 1 })}
        options={filters.contentTypes.map((option) => ({ ...option, count: scoped ? 0 : option.count, label: CONTENT_LABELS[option.value as ContentType] ?? option.value }))}
        selected={state.contentType}
      />

      <fieldset className="border-t border-rule py-4">
        <legend className="label float-left mb-2 w-full">Updated within</legend>
        <div className="clear-both grid grid-cols-3">
          {(Object.keys(UPDATED_LABELS) as Array<keyof typeof UPDATED_LABELS>).map((period, index) => {
            const pressed = state.updatedWithin === period;
            return (
              <button
                aria-pressed={pressed}
                className={`min-h-10 border border-rule-strong px-1 text-xs font-medium transition-colors duration-150 ${index ? "-ml-px" : ""} ${pressed ? "relative z-10 border-ink bg-ink text-paper" : "bg-paper-raised text-ink-soft hover:border-ink hover:text-ink"}`}
                key={period}
                onClick={() => onChange({ updatedWithin: pressed ? null : period, page: 1 })}
                type="button"
              >
                {UPDATED_LABELS[period]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <FilterList
        label="Language"
        onToggle={(value) => onChange({ language: toggle(state.language, value), page: 1 })}
        options={filters.languages.slice(0, 8).map((option) => ({ ...option, count: scoped ? 0 : option.count, label: option.value }))}
        selected={state.language}
      />
    </div>
  );
}

export function SearchFilters({
  filters,
  state,
  lockedSource,
  hasFilters,
  mobileOpen,
  onChange,
  onClear,
  onMobileOpenChange,
  mobileTriggerRef,
}: {
  filters: FiltersResponse;
  state: SearchState;
  lockedSource?: string;
  hasFilters: boolean;
  mobileOpen: boolean;
  onChange: (patch: Partial<SearchState>) => void;
  onClear: () => void;
  onMobileOpenChange: (open: boolean) => void;
  mobileTriggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const content = <FilterContent filters={filters} hasFilters={hasFilters} lockedSource={lockedSource} onChange={onChange} onClear={onClear} state={state} />;
  return (
    <>
      <aside aria-label="Search filters" className="hidden lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:block lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        {content}
      </aside>
      <Sheet description="Narrow the results by source, content type, recency, and language." onOpenChange={onMobileOpenChange} open={mobileOpen} returnFocusRef={mobileTriggerRef} title="Search filters">
        <div className="px-5 py-4">{content}</div>
        <div className="sticky bottom-0 border-t border-rule bg-paper px-5 py-3">
          <button className="button w-full" onClick={() => onMobileOpenChange(false)} type="button">Show results</button>
        </div>
      </Sheet>
    </>
  );
}

export { CONTENT_LABELS, UPDATED_LABELS };
