import { parseSearchState, toSearchParams } from "@/lib/url-state";

describe("search URL state", () => {
  it("parses repeated filters and valid options", () => {
    const state = parseSearchState(new URLSearchParams("q=hooks&source=react&source=mdn&contentType=reference&sort=newest&updatedWithin=30d"));
    expect(state).toMatchObject({ q: "hooks", source: ["react", "mdn"], contentType: ["reference"], sort: "newest", updatedWithin: "30d" });
  });

  it("normalizes malformed pagination and enum values", () => {
    const state = parseSearchState(new URLSearchParams("page=-4&limit=500&sort=random&contentType=unknown&updatedWithin=1y"));
    expect(state).toMatchObject({ page: 1, limit: 10, sort: "relevance", contentType: [], updatedWithin: null });
  });

  it("deduplicates and bounds filter values", () => {
    const params = new URLSearchParams();
    for (let index = 0; index < 25; index += 1) params.append("tags", index < 2 ? "shared" : `tag-${index}`);
    const state = parseSearchState(params);
    expect(state.tags).toHaveLength(20);
    expect(state.tags.filter((tag) => tag === "shared")).toHaveLength(1);
  });

  it("round trips shareable state", () => {
    const original = parseSearchState(new URLSearchParams("q=server+actions&page=3&source=nextjs&language=en&updatedWithin=7d"));
    expect(parseSearchState(toSearchParams(original))).toEqual(original);
  });
});
