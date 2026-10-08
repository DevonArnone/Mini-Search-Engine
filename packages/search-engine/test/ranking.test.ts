import { describe, expect, it } from "vitest";

import { BoundedHeap } from "../src/heap";
import { search } from "../src/search";
import { buildIndex, doc, ids } from "./helpers";

describe("bounded heap", () => {
  it("returns the same top K as a full sort", () => {
    let seed = 42;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const values = Array.from({ length: 5000 }, (_, i) => ({ score: Math.floor(random() * 500), id: i }));
    const before = (a: (typeof values)[number], b: (typeof values)[number]) => (a.score !== b.score ? a.score > b.score : a.id < b.id);
    for (const k of [0, 1, 7, 100, 5000, 6000]) {
      const heap = new BoundedHeap(k, before);
      for (const value of values) heap.push(value);
      const expected = [...values].sort((a, b) => (before(a, b) ? -1 : 1)).slice(0, k);
      expect(heap.toSortedArray()).toEqual(expected);
      expect(heap.size).toBe(Math.min(k, values.length));
    }
  });
});

describe("ranking stability", () => {
  // Identical text, so identical BM25 scores.
  const twins = [
    doc("c", { title: "cache guide", authority_score: 5 }),
    doc("a", { title: "cache guide", authority_score: 5 }),
    doc("z", { title: "cache guide", authority_score: 9 }),
    doc("b", { title: "cache guide", authority_score: 5 }),
  ];

  it("breaks equal scores by authority, then by id", () => {
    const output = search(buildIndex(twins), { q: "cache", page: 1, limit: 10 });
    expect(new Set(output.hits.map((hit) => hit.score)).size).toBe(1);
    expect(ids(output.hits)).toEqual(["z", "a", "b", "c"]);
  });

  it("does not depend on insertion order", () => {
    const forward = search(buildIndex(twins), { q: "cache", page: 1, limit: 10 });
    const reversed = search(buildIndex([...twins].reverse()), { q: "cache", page: 1, limit: 10 });
    expect(ids(reversed.hits)).toEqual(ids(forward.hits));
  });

  it("never lets authority outrank a higher relevance score", () => {
    const index = buildIndex([
      doc("authoritative", { body: "cache filler filler filler filler filler", authority_score: 10 }),
      doc("relevant", { title: "cache", body: "cache", authority_score: 1 }),
    ]);
    expect(ids(search(index, { q: "cache", page: 1, limit: 10 }).hits)).toEqual(["relevant", "authoritative"]);
  });

  it("paginates without gaps or repeats", () => {
    const documents = Array.from({ length: 57 }, (_, i) =>
      doc(`doc-${String(i).padStart(2, "0")}`, { body: `needle ${Array(i % 9).fill("pad").join(" ")}`, authority_score: i % 4 }),
    );
    const index = buildIndex(documents);
    const all = ids(search(index, { q: "needle", page: 1, limit: 100 }).hits);
    expect(all).toHaveLength(57);
    const paged: string[] = [];
    for (let page = 1; page <= 6; page++) {
      const output = search(index, { q: "needle", page, limit: 10 });
      expect(output.totalHits).toBe(57);
      paged.push(...ids(output.hits));
    }
    expect(paged).toEqual(all);
    expect(search(index, { q: "needle", page: 7, limit: 10 }).hits).toEqual([]);
  });

  it("returns identical output for repeated queries", () => {
    const index = buildIndex(twins);
    const first = search(index, { q: "cache guide", page: 1, limit: 10 });
    search(index, { q: "something else entirely", page: 1, limit: 10 });
    expect(search(index, { q: "cache guide", page: 1, limit: 10 })).toEqual(first);
  });
});

describe("replacements and deletions", () => {
  const original = [
    doc("keep", { title: "stream basics", body: "stream reader writer" }),
    doc("change", { title: "stream internals", body: "stream stream buffer backpressure" }),
    doc("drop", { title: "buffer pools", body: "buffer buffer buffer allocation" }),
  ];
  const replacement = doc("change", { title: "queue internals", body: "queue scheduling fairness" });

  const mutated = () => {
    const index = buildIndex(original);
    index.upsert(replacement);
    index.remove("drop");
    return index;
  };
  const rebuilt = () => buildIndex([original[0], replacement]);

  it("removes a replaced document's old terms from the results", () => {
    const index = mutated();
    expect(ids(search(index, { q: "stream", page: 1, limit: 10 }).hits)).toEqual(["keep"]);
    expect(ids(search(index, { q: "queue", page: 1, limit: 10 }).hits)).toEqual(["change"]);
    expect(search(index, { q: "backpressure", page: 1, limit: 10 }).totalHits).toBe(0);
  });

  it("removes deleted documents", () => {
    const index = mutated();
    expect(search(index, { q: "allocation", page: 1, limit: 10 }).totalHits).toBe(0);
    expect(search(index, { q: "", page: 1, limit: 10 }).totalHits).toBe(2);
    expect(index.remove("drop")).toBe(false);
  });

  it("keeps corpus statistics identical to an index built from the final state", () => {
    const a = mutated();
    const b = rebuilt();
    expect(a.liveCount).toBe(b.liveCount);
    expect(Array.from(a.fieldLengthTotals)).toEqual(Array.from(b.fieldLengthTotals));
    for (const [term, list] of b.dictionary) expect(a.dictionary.get(term)?.df, term).toBe(list.df);
    for (const [term, list] of a.dictionary) if (!b.dictionary.has(term)) expect(list.df, term).toBe(0);
  });

  it("scores exactly as an index built from the final state", () => {
    for (const q of ["stream", "queue internals", "reader", ""]) {
      const a = search(mutated(), { q, page: 1, limit: 10 });
      const b = search(rebuilt(), { q, page: 1, limit: 10 });
      expect(a.hits.map((hit) => [hit.id, hit.score])).toEqual(b.hits.map((hit) => [hit.id, hit.score]));
    }
  });

  it("drops tombstones when compacted without changing results", () => {
    const index = mutated();
    expect(index.deadCount).toBe(2);
    const compacted = index.compacted();
    expect(compacted.deadCount).toBe(0);
    expect(compacted.docSlots).toBe(2);
    expect(search(compacted, { q: "stream", page: 1, limit: 10 })).toEqual(search(index, { q: "stream", page: 1, limit: 10 }));
  });
});

describe("filters and sorting", () => {
  const index = buildIndex([
    doc("mdn-ref", { body: "fetch", source_slug: "mdn", content_type: "reference", domain: "developer.mozilla.org", language: "en", tags: ["network", "api"], published_at: "2024-03-10T12:00:00Z", last_updated_at: "2026-09-20T00:00:00Z" }),
    doc("mdn-guide", { body: "fetch", source_slug: "mdn", content_type: "guide", domain: "developer.mozilla.org", language: "fr", tags: ["network"], published_at: "2023-01-05T00:00:00", last_updated_at: "2026-06-01T00:00:00Z" }),
    doc("next-ref", { body: "fetch", source_slug: "nextjs", content_type: "reference", domain: "nextjs.org", language: "en", tags: ["caching"], published_at: "2025-07-01T00:00:00Z", last_updated_at: "2026-10-01T00:00:00Z" }),
    doc("undated", { body: "fetch", source_slug: "react", content_type: "guide", domain: "react.dev", language: "en", tags: [] }),
    doc("other", { body: "unrelated", source_slug: "mdn", content_type: "reference", domain: "developer.mozilla.org", language: "en", tags: ["network"], published_at: "2024-03-10T00:00:00Z" }),
  ]);
  const now = Date.parse("2026-10-07T00:00:00Z");
  const run = (extra: object, q = "fetch") => ids(search(index, { q, page: 1, limit: 10, now, ...extra }).hits).sort();

  it("filters by each attribute", () => {
    expect(run({ source: ["mdn"] })).toEqual(["mdn-guide", "mdn-ref"]);
    expect(run({ source: ["mdn", "react"] })).toEqual(["mdn-guide", "mdn-ref", "undated"]);
    expect(run({ contentType: ["guide"] })).toEqual(["mdn-guide", "undated"]);
    expect(run({ domain: ["nextjs.org"] })).toEqual(["next-ref"]);
    expect(run({ language: ["fr"] })).toEqual(["mdn-guide"]);
    expect(run({ tags: ["caching", "api"] })).toEqual(["mdn-ref", "next-ref"]);
  });

  it("combines filters with AND", () => {
    expect(run({ source: ["mdn"], contentType: ["reference"], tags: ["network"] })).toEqual(["mdn-ref"]);
    expect(run({ source: ["nextjs"], language: ["fr"] })).toEqual([]);
  });

  it("treats date bounds as inclusive UTC days and excludes undated documents", () => {
    expect(run({ from: "2024-03-10" })).toEqual(["mdn-ref", "next-ref"]);
    expect(run({ to: "2024-03-10" })).toEqual(["mdn-guide", "mdn-ref"]);
    expect(run({ from: "2024-03-10", to: "2024-03-10" })).toEqual(["mdn-ref"]);
    expect(run({ from: "2024-03-11", to: "2025-06-30" })).toEqual([]);
  });

  it("filters by recency of the last update", () => {
    expect(run({ updatedWithin: "7d" })).toEqual(["next-ref"]);
    expect(run({ updatedWithin: "30d" })).toEqual(["mdn-ref", "next-ref"]);
    expect(run({ updatedWithin: "90d" })).toEqual(["mdn-ref", "next-ref"]);
  });

  it("applies filters to an empty query and reports exact totals", () => {
    expect(run({ source: ["mdn"] }, "")).toEqual(["mdn-guide", "mdn-ref", "other"]);
    expect(search(index, { q: "", page: 1, limit: 2 }).totalHits).toBe(5);
    expect(search(index, { q: "fetch", page: 1, limit: 1, source: ["mdn"] }).totalHits).toBe(2);
  });

  it("sorts by publication date with undated documents last", () => {
    const sorted = (sort: "newest" | "oldest") => ids(search(index, { q: "fetch", page: 1, limit: 10, sort }).hits);
    expect(sorted("newest")).toEqual(["next-ref", "mdn-ref", "mdn-guide", "undated"]);
    expect(sorted("oldest")).toEqual(["mdn-guide", "mdn-ref", "next-ref", "undated"]);
  });

  it("counts facets over live documents", () => {
    const facets = index.getFacets();
    expect(facets.sources).toEqual([{ value: "mdn", count: 3 }, { value: "nextjs", count: 1 }, { value: "react", count: 1 }]);
    expect(facets.tags[0]).toEqual({ value: "network", count: 3 });
  });
});
