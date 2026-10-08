"use client";

import { Menu, Search } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { ThemeMenu } from "@/components/layout/theme-menu";
import { Sheet } from "@/components/ui/sheet";
import { focusSearchInput, isTypingTarget, requestSearchFocus } from "@/lib/search-focus";
import { SOURCE_DEFINITIONS } from "@/lib/sources";

const NAV_ITEMS = [
  { href: "/search", label: "Search" },
  { href: "/sources", label: "Sources" },
  { href: "/insights", label: "Insights" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Three spines on a shelf.
function Brand() {
  return (
    <svg aria-hidden className="h-6 w-6" viewBox="0 0 24 24">
      <rect fill="rgb(var(--cloth-mdn))" height="15" width="5" x="3" y="4" />
      <rect fill="rgb(var(--cloth-typescript))" height="12" width="4" x="9.5" y="7" />
      <rect fill="rgb(var(--cloth-postgresql))" height="17" width="5.5" x="15" y="2" />
      <rect fill="currentColor" height="1.5" width="22" x="1" y="19.5" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modifier, setModifier] = useState("Ctrl");
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setModifier("⌘");
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  const openSearch = React.useCallback(() => {
    if (focusSearchInput()) return;
    requestSearchFocus();
    router.push("/search");
  }, [router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const commandK = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      openSearch();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/95 backdrop-blur-sm">
      <div className="page flex h-[var(--header-height)] items-center gap-6">
        <Link className="flex items-center gap-2.5 text-ink" href="/">
          <Brand />
          <span className="font-display text-[1.1875rem] font-semibold leading-none tracking-[-0.01em]">DevDocs Search</span>
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden items-stretch self-stretch md:flex">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center px-3.5 text-sm font-medium transition-colors duration-150 ${active ? "text-ink" : "text-ink-soft hover:text-ink"}`}
                href={href}
                key={href}
              >
                {label}
                {active ? <motion.span className="absolute inset-x-3.5 -bottom-px h-0.5 bg-ink" layoutId="nav-indicator" transition={{ type: "spring", stiffness: 520, damping: 42 }} /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button className="hidden min-h-11 items-center gap-2 border border-rule-strong bg-paper-raised pl-3 pr-2 text-sm text-ink-soft transition-colors duration-150 hover:border-ink hover:text-ink sm:inline-flex" onClick={openSearch} style={{ borderRadius: 2 }} type="button">
            <Search aria-hidden className="h-4 w-4" />
            <span>Search the docs</span>
            <kbd className="ml-3 border border-rule-strong px-1.5 py-0.5 font-mono text-2xs text-ink-soft" style={{ borderRadius: 2 }}>{modifier} K</kbd>
          </button>
          <button aria-label="Search the docs" className="icon-button sm:hidden" onClick={openSearch} type="button">
            <Search aria-hidden className="h-5 w-5" />
          </button>
          <ThemeMenu />
          <button aria-label="Open menu" className="icon-button md:hidden" onClick={() => setMenuOpen(true)} ref={menuTriggerRef} type="button">
            <Menu aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>

      <Sheet description="Site navigation" onOpenChange={setMenuOpen} open={menuOpen} returnFocusRef={menuTriggerRef} title="Menu">
        <nav aria-label="Primary" className="px-5 py-3">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link aria-current={isActive(pathname, href) ? "page" : undefined} className="flex min-h-12 items-center border-b border-rule font-display text-xl font-medium text-ink aria-[current=page]:underline" href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-5 pb-6 pt-2">
          <p className="label">Source workspaces</p>
          <ul className="mt-1">
            {SOURCE_DEFINITIONS.map((source) => (
              <li data-source={source.slug} key={source.slug}>
                <Link className="flex min-h-11 items-center gap-3 text-sm text-ink" href={`/sources/${source.slug}`}>
                  <span className="cloth-mark h-5 w-2" />
                  {source.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </header>
  );
}
