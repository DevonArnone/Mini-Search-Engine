"use client";

import { BarChart3, Code2, Database, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/sources", label: "Sources", icon: Database },
  { href: "/insights", label: "Insights", icon: BarChart3 },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur">
      <div className="app-shell flex h-[var(--header-height)] items-center justify-between gap-4">
        <Link className="inline-flex items-center gap-2.5 font-semibold text-ink" href="/" onClick={() => setOpen(false)}>
          <span className="grid h-8 w-8 place-items-center rounded-md bg-ink text-[10px] font-bold text-white">DS</span>
          <span className="hidden sm:inline">DevDocs Search</span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                  active ? "bg-teal-50 text-teal-800" : "text-muted hover:bg-slate-100 hover:text-ink"
                }`}
                href={href}
                key={href}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <a
            aria-label="View repository on GitHub"
            className="icon-button"
            href="https://github.com/DevonArnone/Mini-Search-Engine"
            rel="noopener noreferrer"
            target="_blank"
            title="GitHub repository"
          >
            <Code2 aria-hidden className="h-5 w-5" />
          </a>
          <button
            aria-expanded={open}
            aria-label={open ? "Close navigation" : "Open navigation"}
            className="icon-button md:hidden"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            {open ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav aria-label="Mobile navigation" className="border-t border-line bg-white p-2 md:hidden">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                  active ? "bg-teal-50 text-teal-800" : "text-muted hover:bg-slate-100 hover:text-ink"
                }`}
                href={href}
                key={href}
                onClick={() => setOpen(false)}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
