import { render, screen } from "@testing-library/react";

import { SearchShell } from "@/components/search-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(),
}));

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: string) => {
    if (input.startsWith("/api/search")) {
      return {
        json: async () => ({
          query: "",
          page: 1,
          limit: 10,
          totalHits: 1,
          processingTimeMs: 12,
          results: [
            {
              id: "1",
              title: "Sample",
              url: "https://example.com",
              domain: "example.com",
              snippet: "hello world",
              highlights: [],
              publishedAt: null,
              language: "en",
              tags: ["docs"],
            },
          ],
        }),
      };
    }

    if (input.startsWith("/api/autocomplete")) {
      return { json: async () => ({ suggestions: ["Sample"] }) };
    }

    return {
      json: async () => ({
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
    expect(await screen.findByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("1 results in 12ms")).toBeInTheDocument();
  });
});

