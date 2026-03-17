import { Suspense } from "react";

import { SearchShell } from "@/components/search-shell";
import { StatusOverview } from "@/components/status-overview";
import { getStatus } from "@/lib/status";

export default async function SearchPage() {
  const status = await getStatus();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.25em] text-ocean">Search Workspace</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
          Fast retrieval across indexed documents
        </h1>
      </div>
      <div className="mb-6">
        <StatusOverview status={status} />
      </div>
      <Suspense fallback={<div className="rounded-3xl border border-orange-200 bg-white/80 p-6">Loading search…</div>}>
        <SearchShell />
      </Suspense>
    </main>
  );
}
