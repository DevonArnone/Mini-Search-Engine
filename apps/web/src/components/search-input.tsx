"use client";

import { CornerDownLeft, LoaderCircle, Search, X } from "lucide-react";
import React, { FormEvent, useEffect, useId, useRef, useState } from "react";

import { consumeSearchFocusRequest } from "@/lib/search-focus";

export function SearchInput({
  value,
  suggestions,
  suggestionsLoading,
  onChange,
  onSubmit,
  size = "md",
  placeholder = "Search hooks, APIs, SQL, CSS…",
  label = "Search developer documentation",
}: {
  value: string;
  suggestions: string[];
  suggestionsLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  size?: "md" | "lg";
  placeholder?: string;
  label?: string;
}) {
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (consumeSearchFocusRequest()) inputRef.current?.focus();
  }, []);

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
  const large = size === "lg";

  function submit(event: FormEvent) {
    event.preventDefault();
    const selected = activeIndex >= 0 ? suggestions[activeIndex] : value;
    setOpen(false);
    onSubmit(selected.trim());
  }

  return (
    <form className="relative min-w-0 flex-1" onSubmit={submit} ref={rootRef} role="search">
      <Search aria-hidden className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-faint ${large ? "left-4 h-5 w-5" : "left-3.5 h-4 w-4"}`} />
      <input
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listOpen ? listId : undefined}
        aria-expanded={listOpen}
        aria-label={label}
        autoComplete="off"
        className={`field w-full ${large ? "h-14 border-ink pl-12 pr-28 text-lg" : "h-11 pl-10 pr-24"}`}
        data-search-input
        enterKeyHint="search"
        maxLength={200}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (listOpen) setOpen(false);
            else inputRef.current?.blur();
            return;
          }
          if (!listOpen) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, -1));
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        spellCheck={false}
        value={value}
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
        {suggestionsLoading ? <LoaderCircle aria-label="Loading suggestions" className="mr-1 h-4 w-4 animate-spin text-ink-faint" role="status" /> : null}
        {value ? (
          <button
            aria-label="Clear search"
            className={`icon-button ${large ? "" : "h-9 w-9"}`}
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
        <button aria-label="Search" className={`inline-grid place-items-center bg-ink text-paper transition-colors duration-150 hover:bg-ink-soft ${large ? "h-12 w-12" : "h-9 w-9"}`} style={{ borderRadius: 2 }} type="submit">
          <CornerDownLeft aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {listOpen ? (
        <ul className="absolute z-40 mt-1 max-h-80 w-full overflow-auto border border-rule-strong bg-paper-raised py-1 shadow-lift" id={listId} role="listbox" style={{ borderRadius: 3 }}>
          {suggestions.map((suggestion, index) => (
            // Options are chosen with the pointer here and with arrow keys on the input.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              aria-selected={activeIndex === index}
              className={`flex min-h-10 cursor-pointer items-center gap-2.5 px-3.5 text-sm text-ink ${activeIndex === index ? "bg-paper-sunk" : "hover:bg-paper-sunk"}`}
              id={`${listId}-${index}`}
              key={suggestion}
              onClick={() => {
                onChange(suggestion);
                onSubmit(suggestion);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <span className="truncate">{suggestion}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
