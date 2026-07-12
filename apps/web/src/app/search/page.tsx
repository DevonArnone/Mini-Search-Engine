import type { Metadata } from "next";
import { Suspense } from "react";

import { SearchShell } from "@/components/search-shell";

export const metadata: Metadata = {
  title: "Search",
  description: "Search official MDN, React, Next.js, TypeScript, and PostgreSQL documentation.",
};

export default function SearchPage() {
  return (
    <main className="page-shell min-h-[calc(100vh-var(--header-height))]" id="main-content">
      <header className="mb-5">
        <p className="eyebrow">Documentation workbench</p>
        <h1 className="page-heading mt-1.5">Search official developer docs</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">One ranked index across five authoritative sources, with filters that stay shareable in the URL.</p>
      </header>
      <Suspense fallback={<div className="panel p-8 text-center text-sm text-muted">Loading search workspace…</div>}>
        <SearchShell />
      </Suspense>
    </main>
  );
}
