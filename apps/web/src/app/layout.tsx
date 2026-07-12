import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://github.com/DevonArnone/Mini-Search-Engine"),
  title: {
    default: "DevDocs Search",
    template: "%s | DevDocs Search",
  },
  description: "Search official MDN, React, Next.js, TypeScript, and PostgreSQL documentation in one place.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          href="#main-content"
        >
          Skip to content
        </a>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
