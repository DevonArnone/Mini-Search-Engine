import { NextRequest } from "next/server";

const runSearch = vi.fn();
const query = vi.fn();

vi.mock("@/lib/search", () => ({
  runSearch,
}));

vi.mock("@/lib/db", () => ({
  withDb: vi.fn(async (handler: (client: { query: typeof query }) => Promise<unknown>) =>
    handler({ query }),
  ),
}));

describe("GET /api/search", () => {
  beforeEach(() => {
    runSearch.mockReset();
    query.mockReset();
  });

  it("passes filters and date params through to the search layer", async () => {
    runSearch.mockResolvedValue({
      query: "search",
      page: 2,
      limit: 20,
      totalHits: 42,
      processingTimeMs: 18,
      mode: "live",
      results: [],
    });
    query.mockResolvedValue({ rows: [] });

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:3000/api/search?q=search&page=2&limit=20&domain=docs.example.test&language=en&tags=ranking&sort=newest&from=2025-01-01&to=2025-12-31",
    );

    const response = await GET(request);

    expect(runSearch).toHaveBeenCalledWith({
      q: "search",
      page: 2,
      limit: 20,
      domain: ["docs.example.test"],
      language: ["en"],
      tags: ["ranking"],
      sort: "newest",
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(await response.json()).toMatchObject({
      query: "search",
      mode: "live",
      totalHits: 42,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
