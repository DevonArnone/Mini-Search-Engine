import Link from "next/link";

import { SOURCE_DEFINITIONS } from "@/lib/sources";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule-strong">
      <div className="page grid gap-10 py-10 text-sm sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr]">
        <div>
          <p className="font-display text-lg font-medium text-ink">DevDocs Search</p>
          <p className="mt-2 max-w-sm text-ink-soft">One index over five official documentation sources. Every page shown here is crawled from, and links back to, its publisher.</p>
        </div>
        <nav aria-label="Sources">
          <p className="label">Sources</p>
          <ul className="mt-2 space-y-1.5">
            {SOURCE_DEFINITIONS.map((source) => (
              <li key={source.slug}>
                <Link className="link text-ink-soft hover:text-ink" href={`/sources/${source.slug}`}>{source.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Project">
          <p className="label">Project</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link className="link text-ink-soft hover:text-ink" href="/search">Search</Link></li>
            <li><Link className="link text-ink-soft hover:text-ink" href="/insights">Insights</Link></li>
            <li><a className="link text-ink-soft hover:text-ink" href="https://github.com/DevonArnone/Mini-Search-Engine" rel="noopener noreferrer" target="_blank">Source code on GitHub</a></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
