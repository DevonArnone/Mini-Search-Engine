import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EngineClient, EngineUnavailableError } from "../src/client";
import { IndexWriter } from "../src/store";
import type { BatchOperation } from "../src/types";
import { doc, tempIndexDir } from "./helpers";

const workerPath = path.resolve(__dirname, "../dist/worker.js");
const upsert = (id: string, body: string): BatchOperation => ({ op: "upsert", doc: doc(id, { title: id, body }) });

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

function setup(options: Partial<{ pollMs: number; requestTimeoutMs: number }> = {}) {
  const indexDir = tempIndexDir();
  const client = new EngineClient({ workerPath, indexDir, pollMs: options.pollMs ?? 60_000, requestTimeoutMs: options.requestTimeoutMs ?? 10_000 });
  cleanup.push(() => fs.rmSync(indexDir, { recursive: true, force: true }));
  cleanup.push(() => client.close());
  return { indexDir, client, writer: new IndexWriter(indexDir) };
}

const until = async (check: () => Promise<boolean>, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe("engine worker", () => {
  it("serves searches from a persistent in-memory index", async () => {
    const { client, writer } = setup();
    const manifest = writer.publish([upsert("a", "persistent worker"), upsert("b", "other")]);
    const status = await client.sync();
    expect(status).toMatchObject({ state: "ready", documents: 2, backend: "native" });

    const reply = await client.search({ q: "persistent", page: 1, limit: 10 });
    expect(reply.hits.map((hit) => hit.id)).toEqual(["a"]);
    expect(reply.indexRevision).toBe(`${manifest.generation}.1`);
    expect(reply.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect((await client.autocomplete("a")).suggestions).toEqual(["a"]);
    expect((await client.facets()).domains).toEqual([{ value: "docs.example.test", count: 2 }]);
    // Hydration happened once; the second status reports the same run.
    expect((await client.status()).hydrationMs).toBe(status.hydrationMs);
  });

  it("answers concurrent requests during hydration without hydrating twice", async () => {
    const { client, writer } = setup();
    const filler = Array(400).fill("lorem ipsum dolor sit amet").join(" ");
    writer.publish(Array.from({ length: 3000 }, (_, i) => upsert(`d${i}`, `needle ${i} ${filler}`)));

    const outcomes = await Promise.all(
      Array.from({ length: 40 }, () =>
        client.search({ q: "needle", page: 1, limit: 5 }).then(
          (reply) => reply.totalHits,
          (error: EngineUnavailableError) => error.reason,
        ),
      ),
    );
    // Before the swap a request is refused outright; it never sees a partial index.
    expect(outcomes.filter((outcome) => outcome !== "not_ready" && outcome !== 3000)).toEqual([]);

    const status = await client.sync();
    expect(status).toMatchObject({ state: "ready", documents: 3000, appliedSeq: 12 });
    expect((await client.search({ q: "needle", page: 1, limit: 5 })).totalHits).toBe(3000);
  });

  it("picks up new batches by polling, one whole batch at a time", async () => {
    const { client, writer } = setup({ pollMs: 25 });
    writer.publish([upsert("seed", "needle")]);
    await client.sync();

    writer.publish(Array.from({ length: 750 }, (_, i) => upsert(`d${i}`, "needle")));
    const observed = new Set<number>();
    await until(async () => {
      const { totalHits } = await client.search({ q: "needle", page: 1, limit: 1 });
      observed.add(totalHits);
      return totalHits === 751;
    });
    for (const count of observed) expect((count - 1) % 250).toBe(0);
  });

  it("rejects with a timeout when the worker does not answer in time", async () => {
    const { client, writer } = setup({ requestTimeoutMs: 1 });
    const filler = Array(2000).fill("lorem ipsum dolor sit amet").join(" ");
    writer.publish(Array.from({ length: 250 }, (_, i) => upsert(`d${i}`, filler)));
    await expect(client.sync()).rejects.toMatchObject({ name: "EngineUnavailableError", reason: "timeout" });
    // A late reply for the timed-out request is ignored, and the worker stays usable.
    await expect(client.sync(10_000)).resolves.toMatchObject({ state: "ready", documents: 250 });
  });

  it("reports not_ready when no index has been published", async () => {
    const { client } = setup();
    expect(await client.sync()).toMatchObject({ state: "missing" });
    await expect(client.search({ q: "x", page: 1, limit: 10 })).rejects.toMatchObject({ reason: "not_ready" });
  });

  it("rehydrates from disk after the worker is restarted", async () => {
    const { client, writer } = setup();
    writer.publish([upsert("a", "durable")]);
    const before = await client.sync();
    await client.close();
    await new Promise((resolve) => setTimeout(resolve, 1050));
    const after = await client.sync();
    expect(after.indexRevision).toBe(before.indexRevision);
    expect((await client.search({ q: "durable", page: 1, limit: 10 })).totalHits).toBe(1);
  });
});
