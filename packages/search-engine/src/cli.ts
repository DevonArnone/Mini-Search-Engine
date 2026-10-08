#!/usr/bin/env node
import { Engine, applyOperations } from "./engine";
import { InvertedIndex } from "./inverted-index";
import { explain } from "./search";
import { readBatch, readManifest } from "./store";

// search-index verify <dir>            checks every batch and reports live counts
// search-index search <dir> <query>    runs one query through the engine
// search-index explain <dir> <query> <id>

function usage(): never {
  process.stderr.write("usage: search-index <verify|search|explain> <indexDir> [query] [documentId]\n");
  process.exit(2);
}

async function main(): Promise<void> {
  const [command, indexDir, query, id] = process.argv.slice(2);
  if (!command || !indexDir) usage();

  if (command === "verify") {
    const manifest = readManifest(indexDir);
    if (!manifest) throw new Error(`no manifest in ${indexDir}`);
    const index = new InvertedIndex();
    let upserts = 0;
    let deletes = 0;
    for (const entry of manifest.batches) {
      const operations = readBatch(indexDir, entry);
      for (const operation of operations) operation.op === "upsert" ? upserts++ : deletes++;
      applyOperations(index, operations);
    }
    const bySource: Record<string, number> = {};
    for (const option of index.getFacets().sources) bySource[option.value] = option.count;
    process.stdout.write(
      JSON.stringify(
        {
          generation: manifest.generation,
          revision: manifest.revision,
          batches: manifest.batches.length,
          upserts,
          deletes,
          liveDocuments: index.liveCount,
          terms: index.dictionary.size,
          bySource,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (!query) usage();
  const engine = new Engine(indexDir);
  await engine.sync();
  const status = engine.status();
  if (status.state !== "ready") throw new Error(`index is ${status.state}: ${status.lastError ?? "no detail"}`);

  if (command === "search") {
    const output = engine.search({ q: query, page: 1, limit: 10 });
    process.stdout.write(
      JSON.stringify(
        {
          indexRevision: status.indexRevision,
          totalHits: output.totalHits,
          matchMode: output.matchMode,
          corrections: output.corrections,
          hits: output.hits.map((hit) => ({ id: hit.id, score: hit.score, title: hit.title, url: hit.url, whyMatched: hit.whyMatched })),
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (command === "explain") {
    if (!id) usage();
    process.stdout.write(JSON.stringify(explain(engine.currentIndex() as InvertedIndex, query, id), null, 2) + "\n");
    return;
  }
  usage();
}

main().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
