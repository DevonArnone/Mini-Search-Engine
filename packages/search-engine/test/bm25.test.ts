import { describe, expect, it } from "vitest";

import { B, FIELD_WEIGHTS, K1, idf, saturate } from "../src/bm25";
import { explain, search } from "../src/search";
import { buildIndex, doc, ids } from "./helpers";

// A three-document corpus small enough to score on paper.
//
//            title          body
//   d1       alpha          alpha beta beta
//   d2       beta           gamma gamma gamma gamma delta
//   d3       gamma delta    alpha
//
//   N = 3, average title length = 4/3, average body length = 3
const corpus = () =>
  buildIndex([
    doc("d1", { title: "alpha", body: "alpha beta beta" }),
    doc("d2", { title: "beta", body: "gamma gamma gamma gamma delta" }),
    doc("d3", { title: "gamma delta", body: "alpha" }),
  ]);

const query = (q: string) => ({ q, page: 1, limit: 10 });

describe("BM25F scoring", () => {
  it("uses the documented parameters", () => {
    expect(K1).toBe(1.2);
    expect(B).toBe(0.75);
    expect(FIELD_WEIGHTS).toEqual({ title: 4, headings: 2, description: 2, body: 1, tags: 1, section: 1, source: 1 });
  });

  it("matches a hand calculation for a single term", () => {
    const output = search(corpus(), query("alpha"));

    // idf(alpha): df = 2 -> ln(1 + (3 - 2 + 0.5) / (2 + 0.5)) = ln(1.6)
    const idfAlpha = Math.log(1.6);

    // d1: title tf 1, length 1  -> 4 * 1 / (0.25 + 0.75 * 1 / (4/3)) = 4 / 0.8125
    //     body  tf 1, length 3  -> 1 * 1 / (0.25 + 0.75 * 3 / 3)     = 1
    const d1Tf = 4 / 0.8125 + 1;
    const d1 = (idfAlpha * (d1Tf * 2.2)) / (1.2 + d1Tf);

    // d3: body tf 1, length 1   -> 1 / (0.25 + 0.75 * 1 / 3) = 2
    const d3 = (idfAlpha * (2 * 2.2)) / (1.2 + 2);

    expect(ids(output.hits)).toEqual(["d1", "d3"]);
    expect(output.totalHits).toBe(2);
    expect(output.hits[0].score).toBeCloseTo(d1, 6);
    expect(output.hits[1].score).toBeCloseTo(d3, 6);
    expect(d1).toBeCloseTo(0.859812, 6);
    expect(d3).toBeCloseTo(0.646255, 6);
  });

  it("sums per-term scores for a multi-word query", () => {
    const output = search(corpus(), query("gamma delta"));

    // Both terms have df = 2, so idf = ln(1.6) for each.
    const termIdf = Math.log(1.6);
    const sat = (tf: number) => (tf * 2.2) / (1.2 + tf);

    // d2: gamma body tf 4, delta body tf 1, body length 5 -> norm 1 / (0.25 + 0.75 * 5 / 3) = 1 / 1.5
    const d2 = termIdf * sat(4 / 1.5) + termIdf * sat(1 / 1.5);
    // d3: gamma and delta once each in a 2-word title -> norm 4 / (0.25 + 0.75 * 2 / (4/3)) = 4 / 1.375
    const d3 = 2 * termIdf * sat(4 / 1.375);

    expect(ids(output.hits)).toEqual(["d3", "d2"]);
    expect(output.hits[0].score).toBeCloseTo(d3, 6);
    expect(output.hits[1].score).toBeCloseTo(d2, 6);
  });

  it("exposes every input to the formula through explain()", () => {
    const explanation = explain(corpus(), "alpha", "d1");
    expect(explanation?.documentCount).toBe(3);
    const [term] = explanation?.terms ?? [];
    expect(term.documentFrequency).toBe(2);
    expect(term.idf).toBeCloseTo(Math.log(1.6), 12);
    expect(term.fields.title).toMatchObject({ tf: 1, length: 1 });
    expect(term.fields.title?.averageLength).toBeCloseTo(4 / 3, 12);
    expect(term.fields.body).toMatchObject({ tf: 1, length: 3, averageLength: 3 });
    expect(term.weightedTf).toBeCloseTo(4 / 0.8125 + 1, 12);
  });

  it("weights a title hit above the same hit in the body", () => {
    const index = buildIndex([
      doc("in-title", { title: "widget notes", body: "plain filler" }),
      doc("in-body", { title: "plain notes", body: "widget filler" }),
    ]);
    expect(ids(search(index, query("widget")).hits)).toEqual(["in-title", "in-body"]);
  });

  it("scores each weighted field as documented", () => {
    // Every document fills every field with one word, and exactly one of them
    // is the query term. All lengths equal their averages, so each norm is
    // exactly the field weight.
    const fields = { title: "x", headings: ["x"], meta_description: "x", body: "x", tags: ["x"], section_path: "x", source_name: "x" };
    const index = buildIndex([
      doc("title", { ...fields, title: "needle" }),
      doc("headings", { ...fields, headings: ["needle"] }),
      doc("description", { ...fields, meta_description: "needle" }),
      doc("body", { ...fields, body: "needle" }),
      doc("tags", { ...fields, tags: ["needle"] }),
      doc("section", { ...fields, section_path: "needle" }),
      doc("source", { ...fields, source_name: "needle" }),
    ]);
    const scores = new Map(search(index, query("needle")).hits.map((hit) => [hit.id, hit.score]));
    const termIdf = idf(7, 7);
    for (const [id, weight] of [["title", 4], ["headings", 2], ["description", 2], ["body", 1], ["tags", 1], ["section", 1], ["source", 1]] as const) {
      expect(scores.get(id)).toBeCloseTo(termIdf * saturate(weight), 6);
    }
  });
});

describe("term saturation", () => {
  // Bodies are padded to the same length so only term frequency varies.
  const body = (hits: number) => [...Array(hits).fill("needle"), ...Array(40 - hits).fill("filler")].join(" ");
  const index = buildIndex([1, 2, 4, 8, 16, 32].map((hits) => doc(`tf-${hits}`, { body: body(hits) })));
  const scoreOf = new Map(search(index, { q: "needle", page: 1, limit: 10 }).hits.map((hit) => [hit.id, hit.score]));
  const score = (hits: number) => scoreOf.get(`tf-${hits}`) as number;

  it("increases with term frequency", () => {
    expect(score(2)).toBeGreaterThan(score(1));
    expect(score(32)).toBeGreaterThan(score(16));
  });

  it("gains less from each doubling", () => {
    const gains = [score(2) - score(1), score(4) - score(2), score(8) - score(4), score(16) - score(8), score(32) - score(16)];
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]);
  });

  it("never exceeds idf * (k1 + 1)", () => {
    const ceiling = idf(6, 6) * (K1 + 1);
    expect(score(32)).toBeLessThan(ceiling);
    expect(score(32)).toBeGreaterThan(ceiling * 0.9);
  });
});

describe("length normalization", () => {
  it("ranks the shorter of two documents with equal term frequency first", () => {
    const index = buildIndex([
      doc("long", { body: `needle ${Array(200).fill("filler").join(" ")}` }),
      doc("short", { body: "needle filler filler" }),
    ]);
    const output = search(index, { q: "needle", page: 1, limit: 10 });
    expect(ids(output.hits)).toEqual(["short", "long"]);
  });

  it("applies b = 0.75 against the average field length", () => {
    const index = buildIndex([doc("a", { body: "needle one two three four five six seven" }), doc("b", { body: "needle one" })]);
    // Lengths 8 and 2, average 5.
    const termIdf = idf(2, 2);
    const a = termIdf * saturate(1 / (0.25 + (0.75 * 8) / 5));
    const b = termIdf * saturate(1 / (0.25 + (0.75 * 2) / 5));
    const scores = new Map(search(index, { q: "needle", page: 1, limit: 10 }).hits.map((hit) => [hit.id, hit.score]));
    expect(scores.get("a")).toBeCloseTo(a, 6);
    expect(scores.get("b")).toBeCloseTo(b, 6);
  });
});
