import type { Metadata } from "next";
import { Suspense } from "react";

import { ResultsSkeleton } from "@/components/search-results";
import { SearchShell } from "@/components/search-shell";

export const metadata: Metadata = {
  title: "Search",
  description: "Search official MDN, React, Next.js, TypeScript, and PostgreSQL documentation.",
};

export default function SearchPage() {
  return (
    <main className="page min-h-[calc(100vh-var(--header-height))] pt-6 sm:pt-8" id="main-content">
      <h1 className="title mb-4">Search the documentation</h1>
      <Suspense fallback={<ResultsSkeleton />}>
        <SearchShell />
      </Suspense>
    </main>
  );
}
