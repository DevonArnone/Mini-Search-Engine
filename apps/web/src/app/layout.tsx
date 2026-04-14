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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="text-sm text-stone-600 transition-colors hover:text-ink"
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
        <header className="sticky top-0 z-40 border-b border-orange-100 bg-sand/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <Link
              className="font-display text-lg font-semibold text-ink"
              href="/"
            >
              DevDocs Search
            </Link>
            <nav className="flex items-center gap-6">
              <NavLink href="/search">Search</NavLink>
              <NavLink href="/sources">Sources</NavLink>
              <NavLink href="/insights">Insights</NavLink>
              <Link
                className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
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
