// Modules are reloaded per test, so errors are matched by shape, not class identity.
const UNAVAILABLE = { name: "ServiceUnavailableError", service: "search" };

const engine = { search: vi.fn(), autocomplete: vi.fn(), facets: vi.fn(), status: vi.fn() };
const meiliSearch = vi.fn();
const meiliStats = vi.fn();

vi.mock("@/lib/native-engine", () => ({ getNativeEngine: () => engine }));
vi.mock("@/lib/meili", () => ({ getDocumentsIndex: () => ({ search: meiliSearch, getStats: meiliStats }) }));

const ARGS = { q: "hooks", page: 2, limit: 5, source: ["react"], contentType: [], domain: [], language: [], tags: [], sort: "relevance" as const, updatedWithin: "30d" };

async function loadSearch(backend: string | undefined, demo = false) {
  vi.resetModules();
  if (backend === undefined) delete process.env.SEARCH_BACKEND;
  else process.env.SEARCH_BACKEND = backend;
  process.env.SEARCH_DEMO_MODE = demo ? "true" : "false";
  return import("@/lib/search");
}

describe("search backend selection", () => {
  beforeEach(() => {
    for (const mock of [engine.search, engine.autocomplete, engine.facets, engine.status, meiliSearch, meiliStats]) mock.mockReset();
  });
  afterAll(() => {
    delete process.env.SEARCH_BACKEND;
    delete process.env.SEARCH_DEMO_MODE;
  });

  it("uses the native engine by default and reports its revision", async () => {
    engine.search.mockResolvedValue({ totalHits: 12, matchMode: "all", corrections: {}, processingTimeMs: 0.84, indexRevision: "g1.7", hits: [{ id: "a", title: "useState", score: 3.2, contentType: "reference", freshnessStatus: "fresh" }] });
    const { runSearch } = await loadSearch(undefined);
    const response = await runSearch(ARGS);

    expect(engine.search).toHaveBeenCalledWith(expect.objectContaining({ q: "hooks", page: 2, limit: 5, source: ["react"], updatedWithin: "30d" }));
    expect(response).toMatchObject({ backend: "native", indexRevision: "g1.7", mode: "live", totalHits: 12, processingTimeMs: 0.84 });
    expect(response.results[0]).toMatchObject({ id: "a", score: 3.2 });
    expect(meiliSearch).not.toHaveBeenCalled();
  });

  it("fails rather than falling back to Meilisearch when the native engine is down", async () => {
    engine.search.mockRejectedValue(new Error("search index is hydrating"));
    engine.autocomplete.mockRejectedValue(new Error("worker exited"));
    engine.facets.mockRejectedValue(new Error("timeout"));
    const { runSearch, runAutocomplete, runFilterQuery } = await loadSearch("native");

    await expect(runSearch(ARGS)).rejects.toMatchObject(UNAVAILABLE);
    await expect(runAutocomplete("ho")).rejects.toMatchObject(UNAVAILABLE);
    await expect(runFilterQuery()).rejects.toMatchObject(UNAVAILABLE);
    expect(meiliSearch).not.toHaveBeenCalled();
  });

  it("uses Meilisearch only when it is selected, and never the native engine then", async () => {
    meiliSearch.mockResolvedValue({ hits: [], estimatedTotalHits: 0, processingTimeMs: 3 });
    const { runSearch } = await loadSearch("meilisearch");
    const response = await runSearch(ARGS);
    expect(response).toMatchObject({ backend: "meilisearch", indexRevision: null });
    expect(engine.search).not.toHaveBeenCalled();

    meiliSearch.mockRejectedValue(new Error("connection refused"));
    await expect(runSearch(ARGS)).rejects.toMatchObject(UNAVAILABLE);
    expect(engine.search).not.toHaveBeenCalled();
  });

  it("rejects an unknown backend name at startup", async () => {
    await expect(loadSearch("elasticsearch")).rejects.toThrow(/SEARCH_BACKEND must be/);
  });

  it("labels bundled sample results as demo, only when demo mode is on", async () => {
    engine.search.mockRejectedValue(new Error("down"));
    const { runSearch } = await loadSearch("native", true);
    const response = await runSearch({ ...ARGS, q: "useState", page: 1, source: [], updatedWithin: undefined });
    expect(response).toMatchObject({ mode: "demo", backend: "demo", indexRevision: null });
    expect(response.warning).toMatch(/demo/i);
  });

  it("reports engine health without throwing", async () => {
    engine.status.mockResolvedValue({ state: "hydrating", indexRevision: null, documents: 0, terms: 0, hydrationMs: null, pendingBatches: 12, lastError: null, memory: { rssBytes: 1, heapUsedBytes: 1, externalBytes: 1 } });
    const { getSearchEngineHealth } = await loadSearch("native");
    expect(await getSearchEngineHealth()).toMatchObject({ healthy: false, backend: "native", state: "hydrating" });
    expect((await getSearchEngineHealth()).numberOfDocuments).toBeUndefined();

    engine.status.mockRejectedValue(new Error("worker exited"));
    expect(await getSearchEngineHealth()).toMatchObject({ healthy: false, state: "unavailable" });
  });
});
