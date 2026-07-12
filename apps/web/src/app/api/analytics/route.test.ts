import { NextRequest } from "next/server";

const query = vi.fn();

vi.mock("@/lib/db", () => ({
  withDb: vi.fn(async (handler: (client: { query: typeof query }) => Promise<unknown>) => handler({ query })),
}));

describe("POST /api/analytics", () => {
  beforeEach(() => query.mockReset());

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

  it("rejects malformed click events", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/analytics", { method: "POST", body: JSON.stringify({ resultRank: 0 }) });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
