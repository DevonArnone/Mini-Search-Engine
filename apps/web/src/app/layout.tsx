import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DevDocs Search — Find developer documentation fast",
    template: "%s | DevDocs Search",
  },
  description:
    "Search across MDN, React, Next.js, TypeScript, and PostgreSQL official documentation in one place. Built on a real crawl/index/search stack.",
};

type NavHref = "/" | "/search" | "/sources" | "/insights";

function NavLink({ href, children }: { href: NavHref; children: React.ReactNode }) {
  return (
    <Link
      className="rounded-full px-2 py-1.5 text-sm font-medium text-slate-600 transition duration-200 hover:bg-white/80 hover:text-ink sm:px-3 sm:py-2"
      href={href}
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-sand antialiased">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          href="#main-content"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-white/70 bg-white/[0.72] shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col items-stretch gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <Link
              className="group inline-flex items-center gap-2 whitespace-nowrap font-display text-base font-bold text-ink sm:text-lg"
              href="/"
            >
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-ink text-xs text-white shadow-[0_12px_30px_rgba(15,23,42,0.22)] transition group-hover:-translate-y-0.5">
                DS
              </span>
              <span>DevDocs Search</span>
            </Link>
            <nav className="flex flex-wrap items-center justify-between gap-1 sm:justify-end sm:gap-2">
              <NavLink href="/search">Search</NavLink>
              <NavLink href="/sources">Sources</NavLink>
              <NavLink href="/insights">Insights</NavLink>
              <Link
                className="ml-1 inline-flex items-center rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-slate-800 sm:px-4"
                href="/search"
              >
                Launch
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
