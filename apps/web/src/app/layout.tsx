import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mini Search Engine",
  description: "Portfolio search engine with crawler, indexing, and faceted search.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

