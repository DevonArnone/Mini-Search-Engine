import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  INDEX_FORMAT_VERSION,
  MAX_BATCH_OPERATIONS,
  type BatchOperation,
  type Manifest,
  type ManifestBatch,
} from "./types";

// Layout of SEARCH_INDEX_DIR:
//
//   manifest.json                     replaced atomically (temp file + rename)
//   manifest.lock                     held by the single writer while publishing
//   batches/<generation>-<seq>.jsonl  immutable, one operation per line
//
// A batch becomes visible only when the manifest that lists it has been
// renamed into place, so readers either see a batch completely or not at all.

export const MANIFEST_FILE = "manifest.json";
export const LOCK_FILE = "manifest.lock";
export const BATCH_DIR = "batches";
const LOCK_STALE_MS = 60_000;

export class IndexStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexStoreError";
  }
}

function isManifestBatch(value: unknown): value is ManifestBatch {
  if (!value || typeof value !== "object") return false;
  const batch = value as Record<string, unknown>;
  return (
    Number.isInteger(batch.seq) &&
    typeof batch.file === "string" &&
    typeof batch.sha256 === "string" &&
    Number.isInteger(batch.bytes)
  );
}

export function parseManifest(text: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new IndexStoreError("manifest is not valid JSON");
  }
  const manifest = parsed as Partial<Manifest> | null;
  if (!manifest || typeof manifest !== "object") throw new IndexStoreError("manifest is not an object");
  if (manifest.formatVersion !== INDEX_FORMAT_VERSION) {
    throw new IndexStoreError(`unsupported index format version: ${String(manifest.formatVersion)}`);
  }
  if (typeof manifest.generation !== "string" || !manifest.generation) throw new IndexStoreError("manifest has no generation");
  if (!Number.isInteger(manifest.revision)) throw new IndexStoreError("manifest has no revision");
  if (!Array.isArray(manifest.batches) || !manifest.batches.every(isManifestBatch)) {
    throw new IndexStoreError("manifest batch list is malformed");
  }
  manifest.batches.forEach((batch, position) => {
    if (batch.seq !== position + 1) throw new IndexStoreError(`manifest batch sequence is not contiguous at ${batch.seq}`);
    // Batch paths come from a shared volume; never follow them out of it.
    if (path.isAbsolute(batch.file) || batch.file.split(/[\\/]/).includes("..")) {
      throw new IndexStoreError(`manifest batch path escapes the index directory: ${batch.file}`);
    }
  });
  return manifest as Manifest;
}

// Returns null when no index has been published yet.
export function readManifest(indexDir: string): Manifest | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(indexDir, MANIFEST_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parseManifest(text);
}

// Changes whenever the manifest is replaced; lets a poller skip re-reading it.
export function manifestSignature(indexDir: string): string | null {
  try {
    const stat = fs.statSync(path.join(indexDir, MANIFEST_FILE));
    return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

export function parseBatch(buffer: Buffer, label = "batch"): BatchOperation[] {
  const operations: BatchOperation[] = [];
  const lines = buffer.toString("utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let operation: BatchOperation;
    try {
      operation = JSON.parse(line) as BatchOperation;
    } catch {
      throw new IndexStoreError(`${label} line ${i + 1} is not valid JSON`);
    }
    if (operation?.op === "upsert") {
      const doc = operation.doc;
      if (!doc || typeof doc.id !== "string" || !doc.id) throw new IndexStoreError(`${label} line ${i + 1} upsert has no document id`);
    } else if (operation?.op === "delete") {
      if (typeof operation.id !== "string" || !operation.id) throw new IndexStoreError(`${label} line ${i + 1} delete has no id`);
    } else {
      throw new IndexStoreError(`${label} line ${i + 1} has an unknown operation`);
    }
    operations.push(operation);
  }
  return operations;
}

// Reads and fully validates a batch before returning anything, so a corrupt
// or truncated file can never be partially applied.
export function readBatch(indexDir: string, entry: ManifestBatch): BatchOperation[] {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(path.join(indexDir, entry.file));
  } catch (error) {
    throw new IndexStoreError(`batch ${entry.seq} is unreadable: ${(error as Error).message}`);
  }
  if (buffer.length !== entry.bytes) {
    throw new IndexStoreError(`batch ${entry.seq} is incomplete: expected ${entry.bytes} bytes, found ${buffer.length}`);
  }
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (digest !== entry.sha256) throw new IndexStoreError(`batch ${entry.seq} failed its checksum`);
  return parseBatch(buffer, `batch ${entry.seq}`);
}

// ---------------------------------------------------------------------------
// Writer. The crawler's Python publisher is the production writer; this
// implements the same protocol for tests, tooling, and benchmark corpora.
// ---------------------------------------------------------------------------

function fsyncDirectory(directory: string): void {
  try {
    const handle = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    // Directory fsync is unsupported on some platforms.
  }
}

function writeDurably(target: string, data: Buffer | string): void {
  const temporary = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const handle = fs.openSync(temporary, "w");
  try {
    fs.writeFileSync(handle, data);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temporary, target);
  fsyncDirectory(path.dirname(target));
}

export function newGeneration(): string {
  return `g${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export function serializeBatch(operations: BatchOperation[]): Buffer {
  return Buffer.from(operations.map((operation) => JSON.stringify(operation)).join("\n") + "\n", "utf8");
}

export class IndexWriter {
  constructor(private readonly indexDir: string) {}

  // Appends operations as one or more batches and publishes them with a
  // single manifest replacement.
  publish(operations: BatchOperation[]): Manifest {
    return this.withLock(() => {
      const current = readManifest(this.indexDir);
      const generation = current?.generation ?? newGeneration();
      const batches = [...(current?.batches ?? [])];
      this.appendBatches(generation, batches, operations);
      return this.writeManifest(generation, (current?.revision ?? 0) + 1, batches);
    });
  }

  // Replaces the whole index with a new generation.
  replace(operations: Iterable<BatchOperation>): Manifest {
    return this.withLock(() => {
      const current = readManifest(this.indexDir);
      const generation = newGeneration();
      const batches: ManifestBatch[] = [];
      let pending: BatchOperation[] = [];
      for (const operation of operations) {
        pending.push(operation);
        if (pending.length === MAX_BATCH_OPERATIONS) {
          this.appendBatches(generation, batches, pending);
          pending = [];
        }
      }
      this.appendBatches(generation, batches, pending);
      return this.writeManifest(generation, (current?.revision ?? 0) + 1, batches);
    });
  }

  private appendBatches(generation: string, batches: ManifestBatch[], operations: BatchOperation[]): void {
    fs.mkdirSync(path.join(this.indexDir, BATCH_DIR), { recursive: true });
    for (let start = 0; start < operations.length; start += MAX_BATCH_OPERATIONS) {
      const chunk = operations.slice(start, start + MAX_BATCH_OPERATIONS);
      const seq = batches.length + 1;
      const file = `${BATCH_DIR}/${generation}-${String(seq).padStart(8, "0")}.jsonl`;
      const data = serializeBatch(chunk);
      writeDurably(path.join(this.indexDir, file), data);
      batches.push({
        seq,
        file,
        sha256: createHash("sha256").update(data).digest("hex"),
        bytes: data.length,
        upserts: chunk.filter((operation) => operation.op === "upsert").length,
        deletes: chunk.filter((operation) => operation.op === "delete").length,
        createdAt: new Date().toISOString(),
      });
    }
  }

  private writeManifest(generation: string, revision: number, batches: ManifestBatch[]): Manifest {
    const manifest: Manifest = {
      formatVersion: INDEX_FORMAT_VERSION,
      generation,
      revision,
      updatedAt: new Date().toISOString(),
      batches,
    };
    writeDurably(path.join(this.indexDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");
    return manifest;
  }

  private withLock<T>(action: () => T): T {
    fs.mkdirSync(this.indexDir, { recursive: true });
    const lockPath = path.join(this.indexDir, LOCK_FILE);
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        const handle = fs.openSync(lockPath, "wx");
        fs.writeFileSync(handle, `${process.pid}\n`);
        fs.closeSync(handle);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch {
          continue;
        }
        if (Date.now() > deadline) throw new IndexStoreError("timed out waiting for the index writer lock");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    try {
      return action();
    } finally {
      fs.rmSync(lockPath, { force: true });
    }
  }
}
