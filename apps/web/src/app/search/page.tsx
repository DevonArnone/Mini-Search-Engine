import type { Metadata } from "next";
import { Suspense } from "react";

import { SearchShell } from "@/components/search-shell";

export const metadata: Metadata = {
  title: "Search",
  description: "Full-text search across MDN, React, Next.js, TypeScript, and PostgreSQL documentation.",
};

export default function SearchPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Search documentation
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Full-text search across MDN, React, Next.js, TypeScript, and PostgreSQL official docs.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-3xl border border-orange-200 bg-white/80 p-8 text-center text-sm text-stone-500">
            Loading search…
          </div>
        }
      >
        <SearchShell />
      </Suspense>
    </main>
  );
}
