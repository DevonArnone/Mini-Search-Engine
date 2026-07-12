"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import React, { FormEvent, useEffect, useRef, useState } from "react";

export function SearchInput({
  value,
  suggestions,
  suggestionsLoading,
  onChange,
  onSubmit,
}: {
  value: string;
  suggestions: string[];
  suggestionsLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  const listOpen = open && value.length > 1 && suggestions.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    const selected = activeIndex >= 0 ? suggestions[activeIndex] : value;
    setOpen(false);
    onSubmit(selected.trim());
  }

  return (
    <form className="relative min-w-0 flex-1" onSubmit={submit} ref={rootRef} role="search">
      <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        aria-activedescendant={activeIndex >= 0 ? `search-suggestion-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listOpen ? "search-suggestions" : undefined}
        aria-expanded={listOpen}
        aria-label="Search developer documentation"
        autoComplete="off"
        className="control h-11 w-full pl-10 pr-20"
        maxLength={200}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!listOpen) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, -1));
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search hooks, APIs, SQL, CSS…"
        ref={inputRef}
        role="combobox"
        value={value}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {suggestionsLoading ? <LoaderCircle aria-label="Loading suggestions" className="h-4 w-4 animate-spin text-muted" /> : null}
        {value ? (
          <button
            aria-label="Clear search"
            className="icon-button h-8 w-8"
            onClick={() => {
              onChange("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            type="button"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {listOpen ? (
        <ul className="absolute z-40 mt-1.5 max-h-80 w-full overflow-auto rounded-md border border-line bg-white p-1 shadow-panel" id="search-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => (
            <li aria-selected={activeIndex === index} id={`search-suggestion-${index}`} key={suggestion} role="option">
              <button
                className={`flex min-h-10 w-full items-center gap-2 rounded px-3 text-left text-sm ${activeIndex === index ? "bg-teal-50 text-teal-900" : "text-ink hover:bg-slate-50"}`}
                onClick={() => {
                  onChange(suggestion);
                  onSubmit(suggestion);
                  setOpen(false);
                }}
                type="button"
              >
                <Search aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
