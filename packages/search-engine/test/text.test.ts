import { describe, expect, it } from "vitest";

import { autocomplete } from "../src/autocomplete";
import { buildSnippet, highlight } from "../src/highlight";
import { search } from "../src/search";
import { tokenize, tokenizeQuery, tokenizeWithOffsets } from "../src/tokenizer";
import { boundedEditDistance, findRecoveryCandidates, maxEditDistance } from "../src/typo";
import { buildIndex, doc, ids } from "./helpers";

describe("token normalization", () => {
  it("lowercases and splits on punctuation", () => {
    expect(tokenize("Array.prototype.map() — pg_stat_activity, useState!")).toEqual(["array", "prototype", "map", "pg", "stat", "activity", "usestate"]);
  });

  it("folds diacritics and compatibility forms", () => {
    expect(tokenize("Café déjà-vu ﬁle")).toEqual(["cafe", "deja", "vu", "file"]);
  });

  it("keeps digits and drops oversized tokens", () => {
    expect(tokenize(`http2 es2022 ${"x".repeat(65)} ok`)).toEqual(["http2", "es2022", "ok"]);
  });

  it("reports offsets into the original text", () => {
    const text = "Use <b>café</b>";
    expect(tokenizeWithOffsets(text).map((span) => [span.term, text.slice(span.start, span.end)])).toEqual([["use", "Use"], ["b", "b"], ["cafe", "café"], ["b", "b"]]);
  });

  it("deduplicates query terms in order", () => {
    expect(tokenizeQuery("React react hooks React")).toEqual(["react", "hooks"]);
    expect(tokenizeQuery("  --  ")).toEqual([]);
  });
});

describe("safe highlighting", () => {
  it("escapes markup from the source text and only emits <em>", () => {
    const html = highlight(`<script>alert("x")</script> fetch & 'retry'`, new Set(["fetch", "script"]));
    expect(html).toBe("&lt;<em>script</em>&gt;alert(&quot;x&quot;)&lt;/<em>script</em>&gt; <em>fetch</em> &amp; &#39;retry&#39;");
    expect(html.replace(/<\/?em>/g, "")).not.toMatch(/[<>]/);
  });

  it("matches on normalized tokens but preserves original casing", () => {
    expect(highlight("UseState and useState", new Set(["usestate"]))).toBe("<em>UseState</em> and <em>useState</em>");
  });

  it("centers the snippet on the densest window of query terms", () => {
    const filler = (n: number) => Array(n).fill("filler").join(" ");
    const body = `alpha ${filler(80)} alpha beta near each other ${filler(80)}`;
    const snippet = buildSnippet(body, new Set(["alpha", "beta"]));
    expect(snippet.matched).toBe(true);
    expect(snippet.html).toContain("<em>alpha</em> <em>beta</em>");
    expect(snippet.html.startsWith("…")).toBe(true);
    expect(snippet.html.endsWith("…")).toBe(true);
    expect(tokenize(snippet.html.replace(/<\/?em>/g, ""))).toHaveLength(35);
  });

  it("falls back to the opening text when nothing matches", () => {
    const snippet = buildSnippet("one two three", new Set(["zzz"]));
    expect(snippet).toEqual({ html: "one two three", matched: false });
  });

  it("carries escaping through search results", () => {
    const index = buildIndex([doc("x", { title: "<img src=x onerror=1> fetch", meta_description: "a < b", body: "fetch <b>bold</b>" })]);
    const [hit] = search(index, { q: "fetch", page: 1, limit: 10 }).hits;
    for (const html of [hit.snippet, ...hit.highlights]) expect(html.replace(/<\/?em>/g, "")).not.toMatch(/[<>]/);
    expect(hit.title).toBe("<img src=x onerror=1> fetch");
    expect(hit.whyMatched).toEqual(["title", "body"]);
  });
});

describe("bounded typo recovery", () => {
  it("computes edit distance with transpositions and an early exit", () => {
    expect(boundedEditDistance("usestate", "usestate", 2)).toBe(0);
    expect(boundedEditDistance("usestate", "usestaet", 2)).toBe(1);
    expect(boundedEditDistance("usestate", "usestat", 2)).toBe(1);
    expect(boundedEditDistance("usestate", "usextaty", 2)).toBe(2);
    expect(boundedEditDistance("usestate", "reducer", 2)).toBe(3);
    expect(boundedEditDistance("abc", "abcdefgh", 2)).toBe(3);
  });

  it("scales the allowed distance with term length", () => {
    expect([3, 4, 7, 8, 20].map(maxEditDistance)).toEqual([0, 1, 1, 2, 2]);
  });

  const index = buildIndex([
    doc("state", { title: "useState", body: "state hook" }),
    doc("effect", { title: "useEffect", body: "effect hook" }),
    doc("promise", { title: "Promise", body: "asynchronous promise value" }),
    doc("promises", { title: "Using promises", body: "promises chain" }),
  ]);
  const run = (q: string) => search(index, { q, page: 1, limit: 10 });

  it("prefers exact matches and does not expand them", () => {
    const output = run("promise");
    expect(output.matchMode).toBe("all");
    expect(output.corrections).toEqual({});
    expect(ids(output.hits)).toEqual(["promise"]);
  });

  it("recovers a misspelled term", () => {
    const output = run("usestaet hook");
    expect(output.matchMode).toBe("corrected");
    expect(output.corrections).toEqual({ usestaet: ["usestate"] });
    expect(ids(output.hits)).toEqual(["state"]);
    expect(output.hits[0].highlights[0]).toBe("<em>useState</em>");
  });

  it("offers only the closest spellings", () => {
    const near = buildIndex([
      doc("one-edit", { title: "useState" }),
      doc("two-edits", { title: "userState screenState" }),
    ]);
    const output = search(near, { q: "usestaet", page: 1, limit: 10 });
    expect(output.corrections).toEqual({ usestaet: ["usestate"] });
    expect(ids(output.hits)).toEqual(["one-edit"]);
  });

  it("completes an unfinished word", () => {
    const output = run("promis");
    expect(output.matchMode).toBe("corrected");
    expect(output.corrections.promis).toEqual(expect.arrayContaining(["promise", "promises"]));
    expect(ids(output.hits).sort()).toEqual(["promise", "promises"]);
  });

  it("scores a recovered match below the exact one", () => {
    const exact = run("usestate").hits[0].score;
    const typo = run("usestaet").hits[0].score;
    expect(typo).toBeLessThan(exact);
    expect(typo).toBeCloseTo(exact * 0.6, 6);
  });

  it("limits candidates per term and never rewrites short terms", () => {
    const many = buildIndex(Array.from({ length: 30 }, (_, i) => doc(`d${i}`, { body: `config${String.fromCharCode(97 + (i % 26))}${i}` })));
    expect(findRecoveryCandidates(many, "config").length).toBeLessThanOrEqual(12);
    expect(findRecoveryCandidates(index, "us")).toEqual([]);
  });

  it("falls back to partial matches when no document holds every term", () => {
    const output = run("effect promise");
    expect(output.matchMode).toBe("any");
    expect(ids(output.hits).sort()).toEqual(["effect", "promise"]);
  });

  it("returns nothing, not everything, when the query has no searchable term", () => {
    for (const q of ["???", " -- ", "x".repeat(80)]) {
      expect(run(q)).toMatchObject({ totalHits: 0, hits: [] });
    }
    expect(run("").totalHits).toBe(4);
  });

  it("returns nothing for a term with no bounded candidate", () => {
    const output = run("zzzznotfound");
    expect(output.totalHits).toBe(0);
    expect(output.hits).toEqual([]);
  });
});

describe("prefix autocomplete", () => {
  const index = buildIndex([
    doc("1", { title: "useState", authority_score: 9 }),
    doc("2", { title: "useEffect", authority_score: 9 }),
    doc("3", { title: "Using TypeScript with React", authority_score: 5 }),
    doc("4", { title: "State: A Component's Memory", authority_score: 9 }),
    doc("5", { title: "useState", authority_score: 3 }),
    doc("6", { title: null }),
  ]);

  it("completes the word being typed against title words", () => {
    expect(autocomplete(index, "use")).toEqual(["useState", "useEffect"]);
    expect(autocomplete(index, "us")).toEqual(["useState", "useEffect", "Using TypeScript with React"]);
  });

  it("requires completed words and deduplicates titles", () => {
    expect(autocomplete(index, "typescript re")).toEqual(["Using TypeScript with React"]);
    expect(autocomplete(index, "typescript vue")).toEqual([]);
    expect(autocomplete(index, "usestate")).toEqual(["useState"]);
  });

  it("treats a trailing space as a finished word", () => {
    expect(autocomplete(index, "state ")).toEqual(["State: A Component's Memory"]);
    expect(autocomplete(index, "stat ")).toEqual([]);
  });

  it("ignores removed documents and empty input", () => {
    index.remove("2");
    expect(autocomplete(index, "use")).toEqual(["useState"]);
    expect(autocomplete(index, "   ")).toEqual([]);
  });
});
