import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SOURCE_DEFINITIONS } from "@/lib/sources";

export default function NotFound() {
  return (
    <main className="page min-h-[calc(100vh-var(--header-height)-16rem)] pb-8 pt-14 sm:pt-20" id="main-content">
      <p className="font-mono text-sm text-ink-soft">404 · not on the shelf</p>
      <h1 className="display mt-3 max-w-3xl text-[clamp(2.5rem,6vw,4.75rem)]">This page isn&rsquo;t in the catalog.</h1>
      <p className="mt-4 max-w-prose text-ink-soft">The address may be mistyped, or the page may have moved. The search and the five source workspaces are all still here.</p>
      <div className="mt-7 flex flex-wrap gap-2">
        <Link className="button" href="/search">Search the documentation<ArrowRight aria-hidden className="h-4 w-4" /></Link>
        <Link className="button-quiet" href="/">Back to the front page</Link>
      </div>
      <ul className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-rule-strong pt-5 text-sm">
        {SOURCE_DEFINITIONS.map((source) => (
          <li className="flex items-center gap-2" data-source={source.slug} key={source.slug}>
            <span aria-hidden className="h-4 w-1.5 bg-cloth" />
            <Link className="link text-ink" href={`/sources/${source.slug}`}>{source.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
