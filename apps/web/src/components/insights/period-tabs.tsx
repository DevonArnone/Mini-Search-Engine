import type { InsightsPeriodDays } from "@mini-search/shared-types";
import Link from "next/link";

import { INSIGHTS_PERIODS } from "@/lib/insights";

export function PeriodTabs({ current }: { current: InsightsPeriodDays }) {
  return (
    <nav aria-label="Reporting period" className="inline-flex">
      {INSIGHTS_PERIODS.map((days, index) => {
        const active = days === current;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border border-rule-strong px-4 text-sm font-semibold transition-colors duration-150 ${index ? "-ml-px" : ""} ${active ? "relative z-10 border-ink bg-ink text-paper" : "bg-paper-raised text-ink-soft hover:border-ink hover:text-ink"}`}
            href={days === 30 ? "/insights" : `/insights?period=${days}d`}
            key={days}
            scroll={false}
          >
            {days} days
          </Link>
        );
      })}
    </nav>
  );
}
