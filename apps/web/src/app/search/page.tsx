import type { Metadata } from "next";
import { Suspense } from "react";

import { SearchShell } from "@/components/search-shell";

export const metadata: Metadata = {
  title: "Search",
  description: "Full-text search across MDN, React, Next.js, TypeScript, and PostgreSQL documentation.",
};

export default function SearchPage() {
  return (
    <main id="main-content" className="page-shell min-h-screen">
      <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/70 bg-white/[0.72] p-6 shadow-premium backdrop-blur-xl sm:p-8">
        <p className="section-kicker">Search workspace</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Fast retrieval for developer docs
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Full-text search across MDN, React, Next.js, TypeScript, and PostgreSQL official docs.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="premium-card p-8 text-center text-sm text-slate-500">
            Loading search…
          </div>
        }
      >
        <SearchShell />
      </Suspense>
    </main>
  );
}
