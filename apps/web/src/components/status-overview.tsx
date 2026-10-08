import { Check, TriangleAlert } from "lucide-react";

import type { StatusResponse } from "@mini-search/shared-types";

import { formatCount } from "@/lib/format";

function State({ healthy, label }: { healthy: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${healthy ? "text-ok" : "text-bad"}`}>
      {healthy ? <Check aria-hidden className="h-4 w-4" /> : <TriangleAlert aria-hidden className="h-4 w-4" />}
      {label}
    </span>
  );
}

const ENGINE_STATES: Record<string, string> = {
  ready: "Ready",
  hydrating: "Loading the index",
  starting: "Starting",
  missing: "No index published",
  error: "Index failed to load",
  unavailable: "Not responding",
};

// Rows whose value is unknown are left out; a failed service says so.
export function StatusOverview({ status }: { status: StatusResponse }) {
  const engine = status.searchEngine;
  const diagnostics = engine.diagnostics;
  const rows: Array<[string, React.ReactNode]> = [];

  rows.push(["Search engine", <State healthy={engine.healthy} key="engine" label={engine.backend === "native" ? ENGINE_STATES[engine.state ?? "unavailable"] ?? engine.state : engine.healthy ? "Ready" : "Not responding"} />]);
  rows.push(["Backend", engine.backend === "native" ? "Native inverted index (BM25)" : "Meilisearch"]);
  if (engine.healthy && engine.numberOfDocuments !== undefined) rows.push(["Documents in the index", <span className="font-mono" key="docs">{formatCount(engine.numberOfDocuments)}</span>]);
  if (engine.indexRevision) rows.push(["Index revision", <span className="font-mono" key="rev">{engine.indexRevision}</span>]);
  if (engine.healthy && diagnostics) {
    rows.push(["Distinct terms", <span className="font-mono" key="terms">{formatCount(diagnostics.terms)}</span>]);
    if (diagnostics.hydrationMs !== null) rows.push(["Index load time at startup", <span className="font-mono" key="hydration">{formatCount(diagnostics.hydrationMs)} ms</span>]);
    if (diagnostics.pendingBatches > 0) rows.push(["Batches waiting to apply", <span className="font-mono" key="pending">{diagnostics.pendingBatches}</span>]);
  }
  if (diagnostics?.lastError) rows.push(["Last index error", <span className="text-bad" key="error">{diagnostics.lastError}</span>]);

  rows.push(["PostgreSQL", <State healthy={status.database.healthy} key="db" label={status.database.healthy ? "Connected" : "Not connected"} />]);
  if (status.database.healthy) {
    rows.push(["Documents marked indexed", <span className="font-mono" key="indexed">{formatCount(status.indexedDocuments)}</span>]);
    rows.push(["Pages waiting in the crawl queue", <span className="font-mono" key="queue">{formatCount(status.queuedDocuments)}</span>]);
    rows.push(["Failed fetches logged", <span className="font-mono" key="failures">{formatCount(status.crawlFailures)}</span>]);
    rows.push(["Duplicate pages excluded", <span className="font-mono" key="duplicates">{formatCount(status.duplicateDocuments)}</span>]);
  }

  return (
    <section aria-labelledby="system-status-heading">
      <h2 className="heading" id="system-status-heading">Service health</h2>
      <p className="mt-1 text-sm text-ink-soft">Read from the running services when this page loaded.</p>
      <dl className="mt-4 grid border-t border-rule-strong text-sm sm:grid-cols-2 sm:gap-x-10">
        {rows.map(([term, detail]) => (
          <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5" key={term}>
            <dt className="text-ink-soft">{term}</dt>
            <dd className="min-w-0 break-words text-right text-ink">{detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
