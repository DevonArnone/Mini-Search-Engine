import { NextRequest } from "next/server";

import { ServiceUnavailableError } from "@/lib/api";

const runSearch = vi.fn();
const query = vi.fn();
const afterTasks: Array<() => Promise<void>> = [];

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => afterTasks.push(task),
}));

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
    afterTasks.length = 0;
  });

  it("passes all filter params to the search layer", async () => {
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
      "http://localhost:3000/api/search?q=search&page=2&limit=20" +
        "&source=mdn&source=react" +
        "&contentType=reference" +
        "&domain=docs.example.test" +
        "&language=en" +
        "&tags=ranking" +
        "&sort=newest" +
        "&from=2025-01-01&to=2025-12-31" +
        "&updatedWithin=30d",
    );

    const response = await GET(request);

    expect(runSearch).toHaveBeenCalledWith({
      q: "search",
      page: 2,
      limit: 20,
      source: ["mdn", "react"],
      contentType: ["reference"],
      domain: ["docs.example.test"],
      language: ["en"],
      tags: ["ranking"],
      sort: "newest",
      from: "2025-01-01",
      to: "2025-12-31",
      updatedWithin: "30d",
    });
    const body = await response.json();
    expect(body).toMatchObject({
      query: "search",
      mode: "live",
      totalHits: 42,
    });

    // The analytics write is scheduled for after the response, not awaited.
    expect(query).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][0]).toBe(body.searchId);
  });

  it("defaults source and contentType to empty arrays when not provided", async () => {
    runSearch.mockResolvedValue({
      query: "",
      page: 1,
      limit: 10,
      totalHits: 0,
      processingTimeMs: 5,
      mode: "live",
      results: [],
    });
    query.mockResolvedValue({ rows: [] });

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/search");
    await GET(request);

    expect(runSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        source: [],
        contentType: [],
        updatedWithin: undefined,
      }),
    );
    expect(afterTasks).toHaveLength(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("still returns a search id when the analytics write later fails", async () => {
    runSearch.mockResolvedValue({ query: "hooks", page: 1, limit: 10, totalHits: 3, processingTimeMs: 1, mode: "live", results: [] });
    query.mockRejectedValue(new Error("database down"));
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=hooks"));
    expect(response.status).toBe(200);
    expect((await response.json()).searchId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(afterTasks[0]()).resolves.toBeUndefined();
  });

  it("returns structured validation errors", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/search?page=0&limit=100"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(runSearch).not.toHaveBeenCalled();
  });

  it("returns 503 when the search service is unavailable", async () => {
    runSearch.mockRejectedValue(new ServiceUnavailableError("search"));
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=hooks"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "search_unavailable", message: "Search is temporarily unavailable. Please try again." } });
  });
});
