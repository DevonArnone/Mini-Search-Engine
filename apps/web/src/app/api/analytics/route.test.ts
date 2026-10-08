import { NextRequest } from "next/server";

const query = vi.fn();

vi.mock("@/lib/db", () => ({
  withDb: vi.fn(async (handler: (client: { query: typeof query }) => Promise<unknown>) => handler({ query })),
}));

describe("POST /api/analytics", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("records a click linked to its search", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "devdocs_session=11111111-1111-4111-8111-111111111111" },
      body: JSON.stringify({
        searchId: "22222222-2222-4222-8222-222222222222",
        clickedDocumentId: "33333333-3333-4333-8333-333333333333",
        resultRank: 4,
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("result_click"), [
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
      4,
    ]);
  });

  it("waits for a search event that is still being persisted", async () => {
    const { deferSearchEvent } = await import("@/lib/analytics");
    const searchId = "44444444-4444-4444-8444-444444444444";
    const order: string[] = [];
    let releaseSearchInsert: () => void = () => {};
    query.mockImplementation((sql: string) => {
      if (sql.includes("'search'") && !sql.includes("result_click")) {
        return new Promise((resolve) => {
          releaseSearchInsert = () => {
            order.push("search persisted");
            resolve({ rowCount: 1 });
          };
        });
      }
      order.push("click inserted");
      return Promise.resolve({ rowCount: 1 });
    });

    // The search response has gone out; its analytics write is in flight.
    const persisting = deferSearchEvent({ searchId, sessionId: "11111111-1111-4111-8111-111111111111", query: "hooks", filters: {}, resultsCount: 3, latencyMs: 4 })();

    const { POST } = await import("./route");
    const click = POST(
      new NextRequest("http://localhost:3000/api/analytics", {
        method: "POST",
        body: JSON.stringify({ searchId, clickedDocumentId: "33333333-3333-4333-8333-333333333333", resultRank: 1 }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual([]);

    releaseSearchInsert();
    await persisting;
    expect((await click).status).toBe(200);
    expect(order).toEqual(["search persisted", "click inserted"]);
  });

  it("reports a click whose search event never arrives", async () => {
    query.mockResolvedValue({ rowCount: 0 });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/analytics", {
        method: "POST",
        body: JSON.stringify({ searchId: "55555555-5555-4555-8555-555555555555", clickedDocumentId: "33333333-3333-4333-8333-333333333333", resultRank: 2 }),
      }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "unknown_search" } });
    // One attempt plus the bounded retries.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed click events", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/analytics", { method: "POST", body: JSON.stringify({ resultRank: 0 }) });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
