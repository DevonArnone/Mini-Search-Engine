"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

import { SOURCE_BY_SLUG } from "@/lib/sources";
import { crawlStatusLabel, formatDay } from "@/lib/format";

export interface ShelfVolume {
  slug: string;
  // Null when the count is not known (services unavailable).
  docCount: number | null;
  crawlStatus: string | null;
  lastCrawledAt: string | null;
}

// Books are not all the same height.
const HEIGHTS: Record<string, string> = { mdn: "100%", react: "80%", nextjs: "91%", typescript: "85%", postgresql: "96%" };

// The five sources as volumes on a shelf. When counts are known, each spine's
// width is proportional to its indexed documents.
export function Shelf({ volumes }: { volumes: ShelfVolume[] }) {
  const known = volumes.every((volume) => volume.docCount !== null) && volumes.some((volume) => (volume.docCount ?? 0) > 0);
  const largest = volumes.reduce((best, volume) => ((volume.docCount ?? 0) > (best.docCount ?? 0) ? volume : best), volumes[0]);
  const [activeSlug, setActiveSlug] = useState(largest.slug);
  const active = volumes.find((volume) => volume.slug === activeSlug) ?? largest;
  const activeSource = SOURCE_BY_SLUG.get(active.slug);

  return (
    <div>
      <ul aria-label="Indexed sources" className="flex h-60 items-end gap-1 sm:h-80 lg:h-[23rem]">
        {volumes.map((volume) => {
          const source = SOURCE_BY_SLUG.get(volume.slug);
          if (!source) return null;
          const selected = volume.slug === active.slug;
          return (
            <li
              className="min-w-[2.75rem] transition-[transform,flex-grow] duration-300 ease-out sm:min-w-[3.5rem]"
              data-source={volume.slug}
              key={volume.slug}
              style={{ flex: `${known ? Math.max(volume.docCount ?? 0, 1) : 1} 1 0`, height: HEIGHTS[volume.slug] ?? "90%", transform: selected ? "translateY(-0.625rem)" : undefined }}
            >
              <Link
                aria-label={`${source.name}${volume.docCount ? `, ${volume.docCount.toLocaleString("en-US")} documents` : ""}`}
                className="group relative flex h-full flex-col items-center justify-between overflow-hidden bg-cloth py-3 text-cloth-ink"
                href={`/sources/${volume.slug}`}
                onFocus={() => setActiveSlug(volume.slug)}
                onMouseEnter={() => setActiveSlug(volume.slug)}
                style={{ borderRadius: "2px 2px 0 0" }}
              >
                {/* Headband and tail rules, as stamped on a cloth spine. */}
                <span aria-hidden className="absolute inset-x-0 top-9 border-t border-cloth-ink/35" />
                <span aria-hidden className="absolute inset-x-0 bottom-10 border-t border-cloth-ink/35" />
                <span aria-hidden className="font-mono text-2xs font-semibold">{source.mark}</span>
                <span aria-hidden className="font-display text-lg font-medium leading-none tracking-[-0.01em] sm:text-2xl" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{source.shortName}</span>
                <span aria-hidden className="font-mono text-2xs">{volume.docCount ? volume.docCount.toLocaleString("en-US") : ""}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* The shelf board. */}
      <div aria-hidden className="h-2 bg-ink" />

      {activeSource ? (
        <div className="mt-4 grid min-h-[8.5rem] gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]" data-source={active.slug}>
          <div className="min-w-0">
            <p className="font-display text-xl font-medium text-ink">{activeSource.name}</p>
            <p className="mt-1 max-w-md text-sm text-ink-soft">{activeSource.description}</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] content-start gap-x-4 gap-y-0.5 text-sm sm:text-right">
            {active.docCount ? <><dt className="text-ink-soft sm:order-2 sm:text-left">documents</dt><dd className="font-mono text-ink sm:order-1">{active.docCount.toLocaleString("en-US")}</dd></> : null}
            {active.crawlStatus ? <><dt className="text-ink-soft sm:order-4 sm:text-left">status</dt><dd className="text-ink sm:order-3">{crawlStatusLabel(active.crawlStatus)}</dd></> : null}
            {active.lastCrawledAt ? <><dt className="text-ink-soft sm:order-6 sm:text-left">last crawled</dt><dd className="text-ink sm:order-5">{formatDay(active.lastCrawledAt)}</dd></> : null}
          </dl>
          <Link className="link inline-flex items-center gap-1.5 text-sm font-semibold text-ink sm:col-span-2" href={`/sources/${active.slug}`}>
            Open the {activeSource.shortName} workspace
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
