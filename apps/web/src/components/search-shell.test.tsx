import React from "react";
import { render, screen, within } from "@testing-library/react";

import { SearchShell } from "@/components/search-shell";

const searchParams = new URLSearchParams();
const replace = vi.fn();
const router = { replace };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/search",
  useSearchParams: () => searchParams,
}));

const DEMO_RESULT = {
  id: "1",
  title: "useState – React Reference",
  url: "https://react.dev/reference/react/useState",
  domain: "react.dev",
  sourceSlug: "react",
  sourceName: "React Docs",
  contentType: "reference",
  sectionPath: "Reference > React > Hooks",
  snippet: "useState lets you add state to a function component",
  highlights: [],
  publishedAt: null,
  lastUpdatedAt: null,
  language: "en",
  tags: ["hooks"],
  codeBlockCount: 4,
  freshnessStatus: "fresh",
  whyMatched: ["title"],
};

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith("/api/search")) {
      return {
        ok: true,
        json: async () => ({
          query: "",
          page: 1,
          limit: 10,
          totalHits: 1,
          processingTimeMs: 12,
          mode: "live",
          results: [DEMO_RESULT],
        }),
      };
    }

    if (url.startsWith("/api/autocomplete")) {
      return { ok: true, json: async () => ({ suggestions: ["useState hook"] }) };
    }

    // /api/filters
    return {
      ok: true,
      json: async () => ({
        sources: [{ value: "react", count: 1 }],
        contentTypes: [{ value: "reference", count: 1 }],
        domains: [],
        languages: [],
        tags: [],
        dateBuckets: [],
      }),
    };
  }),
);

describe("SearchShell", () => {
  it("renders search results from the API", async () => {
    render(<SearchShell />);
    expect(await screen.findByText("useState – React Reference")).toBeInTheDocument();
    expect(screen.getByText("1 result in 12ms")).toBeInTheDocument();
  });

  it("shows source badge and content type", async () => {
    render(<SearchShell />);
    const card = await screen.findByRole("article");
    expect(within(card).getByText("React")).toBeInTheDocument();
    expect(within(card).getByText("Reference")).toBeInTheDocument();
  });

  it("shows code example count", async () => {
    render(<SearchShell />);
    expect(await screen.findByText(/4 code examples/)).toBeInTheDocument();
  });
});
