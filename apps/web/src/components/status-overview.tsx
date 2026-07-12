import { Activity, Database, Search, Workflow } from "lucide-react";

import type { StatusResponse } from "@mini-search/shared-types";

function stateLabel(healthy: boolean) {
  return healthy ? { label: "Healthy", color: "bg-emerald-500", text: "text-emerald-700" } : { label: "Unavailable", color: "bg-rose-500", text: "text-rose-700" };
}

export function StatusOverview({ status }: { status: StatusResponse }) {
  const search = stateLabel(status.searchEngine.healthy);
  const database = stateLabel(status.database.healthy);
  const rows = [
    { icon: Search, label: "Search index", value: search.label, dot: search.color, text: search.text },
    { icon: Database, label: "PostgreSQL", value: database.label, dot: database.color, text: database.text },
    { icon: Workflow, label: "Queue depth", value: status.queuedDocuments.toLocaleString(), dot: status.queuedDocuments ? "bg-amber-400" : "bg-emerald-500", text: "text-ink" },
    { icon: Activity, label: "Crawl failures", value: status.crawlFailures.toLocaleString(), dot: status.crawlFailures ? "bg-rose-500" : "bg-emerald-500", text: "text-ink" },
  ];

  return (
    <section className="panel overflow-hidden" aria-labelledby="system-status-heading">
      <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink" id="system-status-heading">System status</h2><span className="text-xs capitalize text-muted">{status.mode}</span></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(({ icon: Icon, label, value, dot, text }, index) => (
          <div className={`flex items-center gap-3 px-4 py-4 ${index ? "border-t border-line sm:border-l sm:border-t-0" : ""} ${index === 2 ? "sm:border-l-0 sm:border-t xl:border-l xl:border-t-0" : ""}`} key={label}>
            <Icon aria-hidden className="h-4 w-4 text-slate-400" /><div className="min-w-0 flex-1"><p className="text-xs text-muted">{label}</p><p className={`mt-0.5 inline-flex items-center gap-2 text-sm font-medium ${text}`}><span className={`status-dot ${dot}`} />{value}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}
