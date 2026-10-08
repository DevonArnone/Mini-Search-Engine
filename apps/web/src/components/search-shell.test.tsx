import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchShell } from "@/components/search-shell";

let searchParams = new URLSearchParams("q=state");
let pathname = "/search";
const replace = vi.fn();
const push = vi.fn();
const router = { replace, push };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
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
  snippet: "useState lets you add <script>alert('x')</script> state to a function component",
  highlights: ["<em>useState</em> – React Reference"],
  publishedAt: null,
  lastUpdatedAt: null,
  language: "en",
  tags: ["hooks"],
  codeBlockCount: 4,
  freshnessStatus: "fresh",
  whyMatched: ["title"],
  score: 4.25,
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
          backend: "native",
          indexRevision: "g1.4",
          searchId: "11111111-1111-4111-8111-111111111111",
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

const searchCalls = () => vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/search"));
const analyticsCalls = () => vi.mocked(fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/analytics"));

describe("SearchShell", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("q=state");
    pathname = "/search";
    push.mockClear();
    replace.mockClear();
    vi.mocked(fetch).mockClear();
  });

  it("renders search results from the API", async () => {
    render(<SearchShell />);
    expect(await screen.findByRole("link", { name: /useState.*React Reference/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1 result for “state”" })).toBeInTheDocument();
    expect(screen.getByText("12 ms")).toBeInTheDocument();
  });

  it("shows source badge and content type", async () => {
    render(<SearchShell />);
    const entry = await screen.findByRole("article");
    expect(within(entry).getByText("React")).toBeInTheDocument();
    expect(within(entry).getByText("Reference")).toBeInTheDocument();
  });

  it("shows code example count", async () => {
    render(<SearchShell />);
    expect(await screen.findByText(/4 code examples/)).toBeInTheDocument();
  });

  it("renders search highlights without injecting source markup", async () => {
    const { container } = render(<SearchShell />);
    expect(await screen.findByText("useState", { selector: "mark" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/alert\('x'\)/)).toBeInTheDocument();
  });

  it("expands provenance without counting it as a result click", async () => {
    const user = userEvent.setup();
    render(<SearchShell />);
    const toggle = await screen.findByRole("button", { name: "Provenance" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("4.250 (BM25)")).toBeVisible();
    expect(screen.getByText("g1.4")).toBeVisible();
    expect(analyticsCalls()).toHaveLength(0);
  });

  it("records a click only when the result document is opened", async () => {
    const user = userEvent.setup();
    // The fixture id is not a document UUID, so use one that is.
    DEMO_RESULT.id = "33333333-3333-4333-8333-333333333333";
    render(<SearchShell />);
    await user.click(await screen.findByRole("link", { name: /useState.*React Reference/ }));
    expect(analyticsCalls()).toHaveLength(1);
    expect(JSON.parse(String(analyticsCalls()[0][1]?.body))).toEqual({ searchId: "11111111-1111-4111-8111-111111111111", clickedDocumentId: DEMO_RESULT.id, resultRank: 1 });
    DEMO_RESULT.id = "1";
  });

  it("pushes a history entry when a query is submitted or a filter changes", async () => {
    const user = userEvent.setup();
    render(<SearchShell />);
    const input = screen.getByRole("combobox", { name: "Search developer documentation" });
    await user.clear(input);
    await user.type(input, "hooks{Enter}");
    expect(push).toHaveBeenLastCalledWith("/search?q=hooks", { scroll: false });

    await user.click((await screen.findAllByRole("checkbox", { name: /Reference/ }))[0]);
    expect(push).toHaveBeenLastCalledWith("/search?q=state&contentType=reference", { scroll: false });
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not search until a query is submitted", async () => {
    searchParams = new URLSearchParams("");
    render(<SearchShell />);
    expect(await screen.findByText("Ask the stacks for something.")).toBeInTheDocument();
    expect(searchCalls()).toHaveLength(0);
  });
});

describe("SearchShell in a source workspace", () => {
  beforeEach(() => {
    pathname = "/sources/react";
    push.mockClear();
    vi.mocked(fetch).mockClear();
  });

  it("searches only the workspace source", async () => {
    searchParams = new URLSearchParams("q=state");
    render(<SearchShell initialSource="react" />);
    await screen.findByText("useState", { selector: "mark" });
    expect(searchCalls()).toEqual(["/api/search?q=state&source=react"]);
  });

  it("ignores other sources in a crafted URL", async () => {
    searchParams = new URLSearchParams("q=state&source=mdn&source=postgresql");
    render(<SearchShell initialSource="react" />);
    await screen.findByText("useState", { selector: "mark" });
    expect(searchCalls()).toEqual(["/api/search?q=state&source=react"]);
    expect(screen.queryByRole("checkbox", { name: /MDN/ })).toBeNull();
  });

  it("shows the source as fixed, with no way to remove it", async () => {
    searchParams = new URLSearchParams("q=state");
    render(<SearchShell initialSource="react" />);
    const active = await screen.findByRole("list", { name: "Active filters" });
    expect(within(active).getByText("React")).toBeInTheDocument();
    expect(within(active).queryByRole("button")).toBeNull();
    expect(screen.getAllByText("This workspace only searches React Docs.").length).toBeGreaterThan(0);
  });

  it("keeps the source when filters are cleared", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("q=state&contentType=reference&updatedWithin=30d&source=mdn");
    render(<SearchShell initialSource="react" />);
    await screen.findByText("useState", { selector: "mark" });
    await user.click(screen.getAllByRole("button", { name: "Clear all" })[0]);
    // The source is implied by the route, so the cleared URL carries only the query.
    expect(push).toHaveBeenLastCalledWith("/sources/react?q=state", { scroll: false });

    searchParams = new URLSearchParams("q=state");
    vi.mocked(fetch).mockClear();
    render(<SearchShell initialSource="react" />);
    await screen.findAllByText("useState", { selector: "mark" });
    expect(searchCalls()).toEqual(["/api/search?q=state&source=react"]);
  });
});
