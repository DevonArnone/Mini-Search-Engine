import type { Metadata, Viewport } from "next";

import { display, mono, sans } from "@/app/fonts";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://github.com/DevonArnone/Mini-Search-Engine"),
  title: {
    default: "DevDocs Search",
    template: "%s | DevDocs Search",
  },
  description: "Search official MDN, React, Next.js, TypeScript, and PostgreSQL documentation in one place.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#151210" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // next-themes sets data-theme on <html> before hydration.
    <html className={`${display.variable} ${sans.variable} ${mono.variable}`} lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-paper font-sans text-base text-ink antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={250}>
            <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper" href="#main-content">
              Skip to content
            </a>
            <SiteHeader />
            {children}
            <SiteFooter />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
