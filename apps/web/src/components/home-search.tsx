"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { SearchInput } from "@/components/search-input";
import { useDebounce } from "@/hooks/use-debounce";

export function HomeSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query.trim(), 180);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/autocomplete?q=${encodeURIComponent(debouncedQuery)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json() as { suggestions: string[] };
        setSuggestions(payload.suggestions ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  function submit(value: string) {
    if (!value) return;
    router.push(`/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <div className="panel p-2 shadow-panel">
      <SearchInput onChange={setQuery} onSubmit={submit} suggestions={suggestions} suggestionsLoading={loading} value={query} />
    </div>
  );
}
