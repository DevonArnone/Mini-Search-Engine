import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Engine, EngineNotReadyError } from "../src/engine";
import { IndexStoreError, IndexWriter, MANIFEST_FILE, parseManifest, readBatch, readManifest } from "../src/store";
import type { BatchOperation, Manifest } from "../src/types";
import { doc, ids, tempIndexDir } from "./helpers";

const upsert = (id: string, body: string): BatchOperation => ({ op: "upsert", doc: doc(id, { title: id, body }) });
const dirs: string[] = [];
const newDir = () => {
  const dir = tempIndexDir();
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const batchPath = (dir: string, manifest: Manifest, seq: number) => path.join(dir, manifest.batches[seq - 1].file);

describe("index store", () => {
  it("publishes immutable batches of at most 250 operations", () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    const manifest = writer.publish(Array.from({ length: 601 }, (_, i) => upsert(`d${i}`, "text")));
    expect(manifest.batches.map((batch) => batch.upserts)).toEqual([250, 250, 101]);
    expect(manifest.revision).toBe(1);

    const before = fs.readFileSync(batchPath(dir, manifest, 1));
    const next = writer.publish([{ op: "delete", id: "d0" }]);
    expect(next.generation).toBe(manifest.generation);
    expect(next.revision).toBe(2);
    expect(next.batches.map((batch) => batch.seq)).toEqual([1, 2, 3, 4]);
    expect(next.batches[3]).toMatchObject({ upserts: 0, deletes: 1 });
    expect(fs.readFileSync(batchPath(dir, next, 1)).equals(before)).toBe(true);
    expect(readManifest(dir)).toEqual(next);
  });

  it("leaves no temporary or lock files behind", () => {
    const dir = newDir();
    new IndexWriter(dir).publish([upsert("a", "x")]);
    const files = [...fs.readdirSync(dir), ...fs.readdirSync(path.join(dir, "batches"))];
    expect(files.filter((file) => file.endsWith(".tmp") || file.endsWith(".lock"))).toEqual([]);
  });

  it("starts a new generation when the index is replaced", () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    const first = writer.publish([upsert("a", "x")]);
    const second = writer.replace([upsert("b", "y")]);
    expect(second.generation).not.toBe(first.generation);
    expect(second.revision).toBe(2);
    expect(second.batches).toHaveLength(1);
  });

  it("returns null when nothing has been published", () => {
    expect(readManifest(newDir())).toBeNull();
  });

  it("rejects a truncated batch", () => {
    const dir = newDir();
    const manifest = new IndexWriter(dir).publish([upsert("a", "x"), upsert("b", "y")]);
    const file = batchPath(dir, manifest, 1);
    fs.writeFileSync(file, fs.readFileSync(file).subarray(0, 40));
    expect(() => readBatch(dir, manifest.batches[0])).toThrow(/incomplete/);
  });

  it("rejects a batch whose contents changed", () => {
    const dir = newDir();
    const manifest = new IndexWriter(dir).publish([upsert("a", "xx")]);
    const file = batchPath(dir, manifest, 1);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("xx", "yy"));
    expect(() => readBatch(dir, manifest.batches[0])).toThrow(/checksum/);
  });

  it("rejects malformed manifests", () => {
    const valid = { formatVersion: 1, generation: "g1", revision: 1, updatedAt: "", batches: [] };
    expect(() => parseManifest("{")).toThrow(IndexStoreError);
    expect(() => parseManifest(JSON.stringify({ ...valid, formatVersion: 99 }))).toThrow(/version/);
    const batch = { seq: 1, file: "batches/a.jsonl", sha256: "0", bytes: 1 };
    expect(() => parseManifest(JSON.stringify({ ...valid, batches: [{ ...batch, seq: 2 }] }))).toThrow(/contiguous/);
    expect(() => parseManifest(JSON.stringify({ ...valid, batches: [{ ...batch, file: "../../etc/passwd" }] }))).toThrow(/escapes/);
    expect(() => parseManifest(JSON.stringify({ ...valid, batches: [{ ...batch, file: "/etc/passwd" }] }))).toThrow(/escapes/);
  });
});

describe("engine synchronization", () => {
  const total = (engine: Engine, q = "") => engine.search({ q, page: 1, limit: 50 }).totalHits;

  it("reports a missing index and refuses to search", async () => {
    const engine = new Engine(newDir());
    await engine.sync();
    expect(engine.status()).toMatchObject({ state: "missing", indexRevision: null, documents: 0 });
    expect(() => engine.search({ q: "x", page: 1, limit: 10 })).toThrow(EngineNotReadyError);
  });

  it("hydrates once and applies later batches incrementally", async () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    const manifest = writer.publish([upsert("a", "first"), upsert("b", "first")]);
    const phases: string[] = [];
    const engine = new Engine(dir, { onTiming: (event) => phases.push(`${event.phase}:${event.seq}`) });

    await engine.sync();
    expect(engine.status()).toMatchObject({ state: "ready", documents: 2, indexRevision: `${manifest.generation}.1`, manifestRevision: 1 });
    expect(engine.needsSync()).toBe(false);

    writer.publish([upsert("c", "second"), upsert("a", "replaced"), { op: "delete", id: "b" }]);
    expect(engine.needsSync()).toBe(true);
    await engine.sync();

    expect(phases).toEqual(["hydrate:1", "incremental:2"]);
    expect(engine.status()).toMatchObject({ documents: 2, indexRevision: `${manifest.generation}.2`, manifestRevision: 2 });
    expect(total(engine, "first")).toBe(0);
    expect(ids(engine.search({ q: "replaced", page: 1, limit: 10 }).hits)).toEqual(["a"]);
    expect(ids(engine.search({ q: "second", page: 1, limit: 10 }).hits)).toEqual(["c"]);
  });

  it("shares one hydration between concurrent callers", async () => {
    const dir = newDir();
    new IndexWriter(dir).publish(Array.from({ length: 600 }, (_, i) => upsert(`d${i}`, "text")));
    let hydrated = 0;
    const engine = new Engine(dir, { onTiming: (event) => (hydrated += event.phase === "hydrate" ? 1 : 0) });
    await Promise.all(Array.from({ length: 25 }, () => engine.sync()));
    expect(hydrated).toBe(3);
    expect(engine.status().documents).toBe(600);
  });

  it("does not expose a generation until every batch is loaded", async () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    writer.publish([upsert("old", "text")]);
    const engine = new Engine(dir);
    await engine.sync();

    writer.replace(Array.from({ length: 1000 }, (_, i) => upsert(`new${i}`, "text")));
    const observed = new Set<number>();
    const syncing = engine.sync();
    const watch = setInterval(() => observed.add(total(engine)), 0);
    await syncing;
    clearInterval(watch);
    observed.add(total(engine));
    expect([...observed].filter((count) => count !== 1 && count !== 1000)).toEqual([]);
    expect(total(engine)).toBe(1000);
  });

  it("applies each incremental batch atomically", async () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    writer.publish([upsert("seed", "text")]);
    const engine = new Engine(dir);
    await engine.sync();

    writer.publish(Array.from({ length: 1000 }, (_, i) => upsert(`d${i}`, "text")));
    const observed = new Set<number>();
    const syncing = engine.sync();
    const watch = setInterval(() => observed.add(total(engine)), 0);
    await syncing;
    clearInterval(watch);
    expect(total(engine)).toBe(1001);
    for (const count of observed) expect((count - 1) % 250).toBe(0);
  });

  it("stops at a corrupt batch, keeps serving, and resumes once it is repaired", async () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    writer.publish([upsert("a", "one")]);
    const engine = new Engine(dir);
    await engine.sync();

    const manifest = writer.publish([upsert("b", "two")]);
    writer.publish([upsert("c", "three")]);
    const file = batchPath(dir, manifest, 2);
    const good = fs.readFileSync(file);
    fs.writeFileSync(file, good.subarray(0, good.length - 10));

    await engine.sync();
    expect(engine.status()).toMatchObject({ state: "ready", documents: 1, appliedSeq: 1, pendingBatches: 2 });
    expect(engine.status().lastError).toMatch(/batch 2 is incomplete/);
    expect(total(engine, "one")).toBe(1);
    expect(total(engine, "three")).toBe(0);
    expect(engine.needsSync()).toBe(true);

    fs.writeFileSync(file, good);
    await engine.sync();
    expect(engine.status()).toMatchObject({ documents: 3, appliedSeq: 3, pendingBatches: 0, lastError: null });
  });

  it("reports an error instead of serving a partial first hydration", async () => {
    const dir = newDir();
    const manifest = new IndexWriter(dir).publish(Array.from({ length: 300 }, (_, i) => upsert(`d${i}`, "text")));
    fs.appendFileSync(batchPath(dir, manifest, 2), "garbage");
    const engine = new Engine(dir);
    await engine.sync();
    expect(engine.status()).toMatchObject({ state: "error", documents: 0 });
    expect(() => engine.search({ q: "", page: 1, limit: 10 })).toThrow(EngineNotReadyError);
  });

  it("keeps the loaded index when the manifest becomes unreadable", async () => {
    const dir = newDir();
    new IndexWriter(dir).publish([upsert("a", "one")]);
    const engine = new Engine(dir);
    await engine.sync();
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), "{ not json");
    await engine.sync();
    expect(engine.status()).toMatchObject({ state: "ready", documents: 1 });
    expect(engine.status().lastError).toMatch(/not valid JSON/);
  });

  it("restores the same state after a restart", async () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    writer.publish([upsert("a", "one"), upsert("b", "two")]);
    writer.publish([upsert("a", "changed"), { op: "delete", id: "b" }, upsert("c", "three")]);
    const first = new Engine(dir);
    await first.sync();
    const restarted = new Engine(dir);
    await restarted.sync();
    expect(restarted.status().indexRevision).toBe(first.status().indexRevision);
    for (const q of ["", "one", "changed", "three"]) {
      expect(restarted.search({ q, page: 1, limit: 10 })).toEqual(first.search({ q, page: 1, limit: 10 }));
    }
  });

  it("rebuilds in memory once tombstones pile up", async () => {
    const dir = newDir();
    const writer = new IndexWriter(dir);
    writer.publish(Array.from({ length: 20 }, (_, i) => upsert(`d${i}`, "text")));
    const engine = new Engine(dir, { compactionMinimum: 10, compactionRatio: 0.25 });
    await engine.sync();
    writer.publish(Array.from({ length: 20 }, (_, i) => upsert(`d${i}`, "updated text")));
    await engine.sync();
    expect(engine.status()).toMatchObject({ documents: 20, deadPostingsDocs: 0 });
    expect(total(engine, "updated")).toBe(20);
  });
});
