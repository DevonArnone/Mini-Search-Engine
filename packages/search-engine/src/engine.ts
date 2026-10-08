import { performance } from "node:perf_hooks";

import { autocomplete } from "./autocomplete";
import { InvertedIndex } from "./inverted-index";
import { search } from "./search";
import { manifestSignature, readBatch, readManifest } from "./store";
import type { BatchOperation, EngineState, EngineStatus, FacetCounts, Manifest, SearchOutput, SearchQuery } from "./types";

export class EngineNotReadyError extends Error {
  constructor(public readonly state: EngineState) {
    super(`search index is ${state}`);
    this.name = "EngineNotReadyError";
  }
}

export interface EngineOptions {
  // Share of tombstoned documents that triggers an in-memory rebuild.
  compactionRatio?: number;
  compactionMinimum?: number;
  onTiming?: (event: { phase: "hydrate" | "incremental"; seq: number; readMs: number; applyMs: number; operations: number }) => void;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export function applyOperations(index: InvertedIndex, operations: BatchOperation[]): void {
  for (const operation of operations) {
    if (operation.op === "upsert") index.upsert(operation.doc);
    else index.remove(operation.id);
  }
}

// Owns the in-memory index and keeps it in step with the published manifest.
//
// Searches are synchronous and batches are applied synchronously, one per
// event-loop turn, so a search always sees the index either before or after a
// batch, never in between. A new generation is hydrated on the side and
// swapped in only when every batch has been applied.
export class Engine {
  private index: InvertedIndex | null = null;
  private state: EngineState = "starting";
  private generation: string | null = null;
  private appliedSeq = 0;
  private manifestRevision: number | null = null;
  private pendingBatches = 0;
  private hydrationMs: number | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private signature: string | null = null;
  private syncing: Promise<void> | null = null;

  constructor(
    private readonly indexDir: string,
    private readonly options: EngineOptions = {},
  ) {}

  get indexRevision(): string | null {
    return this.generation ? `${this.generation}.${this.appliedSeq}` : null;
  }

  status(): EngineStatus {
    const memory = process.memoryUsage();
    return {
      state: this.state,
      backend: "native",
      indexRevision: this.indexRevision,
      generation: this.generation,
      appliedSeq: this.appliedSeq,
      manifestRevision: this.manifestRevision,
      documents: this.index?.liveCount ?? 0,
      terms: this.index?.dictionary.size ?? 0,
      deadPostingsDocs: this.index?.deadCount ?? 0,
      hydrationMs: this.hydrationMs,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      pendingBatches: this.pendingBatches,
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, externalBytes: memory.external + memory.arrayBuffers },
    };
  }

  // The loaded index, for inspection tools. Null until the first hydration.
  currentIndex(): InvertedIndex | null {
    return this.index;
  }

  private requireIndex(): InvertedIndex {
    if (!this.index) throw new EngineNotReadyError(this.state);
    return this.index;
  }

  search(query: SearchQuery): SearchOutput {
    return search(this.requireIndex(), query);
  }

  autocomplete(q: string): string[] {
    return autocomplete(this.requireIndex(), q);
  }

  facets(): FacetCounts {
    return this.requireIndex().getFacets();
  }

  // True when the manifest on disk differs from the one last synced, or the
  // last sync stopped early and should be retried.
  needsSync(): boolean {
    return this.pendingBatches > 0 || this.lastError !== null || manifestSignature(this.indexDir) !== this.signature;
  }

  // Concurrent callers share one pass; nothing is ever applied twice.
  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.runSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async runSync(): Promise<void> {
    const signature = manifestSignature(this.indexDir);
    let manifest: Manifest | null;
    try {
      manifest = readManifest(this.indexDir);
    } catch (error) {
      // Keep serving whatever is loaded; the next poll retries.
      this.fail(error);
      return;
    }
    this.signature = signature;
    this.lastSyncAt = new Date().toISOString();

    if (!manifest) {
      if (!this.index) this.state = "missing";
      this.lastError = this.index ? "manifest disappeared; serving the last loaded index" : null;
      return;
    }

    if (manifest.generation !== this.generation) {
      await this.hydrate(manifest);
    } else {
      await this.applyIncremental(manifest);
    }
  }

  private async hydrate(manifest: Manifest): Promise<void> {
    const startedAt = performance.now();
    if (!this.index) this.state = "hydrating";
    this.pendingBatches = manifest.batches.length;
    const fresh = new InvertedIndex();
    try {
      for (const entry of manifest.batches) {
        const readStart = performance.now();
        const operations = readBatch(this.indexDir, entry);
        const applyStart = performance.now();
        applyOperations(fresh, operations);
        this.options.onTiming?.({
          phase: "hydrate",
          seq: entry.seq,
          readMs: applyStart - readStart,
          applyMs: performance.now() - applyStart,
          operations: operations.length,
        });
        this.pendingBatches--;
        await yieldToEventLoop();
      }
    } catch (error) {
      this.fail(error);
      return;
    }
    // Warm the lazily built structures before the first query needs them.
    fresh.getNorms();
    fresh.getFacets();
    fresh.getSortedTitleTerms();

    this.index = fresh;
    this.generation = manifest.generation;
    this.appliedSeq = manifest.batches.length;
    this.manifestRevision = manifest.revision;
    this.pendingBatches = 0;
    this.hydrationMs = performance.now() - startedAt;
    this.lastError = null;
    this.state = "ready";
  }

  private async applyIncremental(manifest: Manifest): Promise<void> {
    const index = this.requireIndex();
    const pending = manifest.batches.filter((entry) => entry.seq > this.appliedSeq);
    this.pendingBatches = pending.length;
    for (const entry of pending) {
      let operations: BatchOperation[];
      const readStart = performance.now();
      try {
        operations = readBatch(this.indexDir, entry);
      } catch (error) {
        // Later batches may depend on this one, so stop here and retry.
        this.fail(error);
        return;
      }
      const applyStart = performance.now();
      applyOperations(index, operations);
      this.appliedSeq = entry.seq;
      this.pendingBatches--;
      this.options.onTiming?.({
        phase: "incremental",
        seq: entry.seq,
        readMs: applyStart - readStart,
        applyMs: performance.now() - applyStart,
        operations: operations.length,
      });
      await yieldToEventLoop();
    }
    this.manifestRevision = manifest.revision;
    this.lastError = null;
    this.state = "ready";

    const ratio = this.options.compactionRatio ?? 0.25;
    const minimum = this.options.compactionMinimum ?? 500;
    if (index.deadCount >= minimum && index.deadCount > index.liveCount * ratio) {
      this.index = index.compacted();
    }
  }

  private fail(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    if (!this.index) this.state = "error";
  }
}
