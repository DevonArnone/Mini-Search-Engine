import { Worker } from "worker_threads";

import type { AutocompleteReply, SearchReply, WorkerOptions, WorkerRequest, WorkerResponse, WorkerResult } from "./protocol";
import type { EngineStatus, FacetCounts, SearchQuery } from "./types";

export class EngineUnavailableError extends Error {
  constructor(
    message: string,
    public readonly reason: "not_ready" | "failed" | "timeout" | "crashed",
  ) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

export interface EngineClientOptions extends WorkerOptions {
  workerPath: string;
  requestTimeoutMs: number;
}

interface Pending {
  resolve: (value: WorkerResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

type RequestBody = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

// Main-thread handle on the engine worker. The worker is started on first use
// and restarted if it dies; requests in flight when it dies are rejected.
export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private lastStartAt = 0;

  constructor(private readonly options: EngineClientOptions) {}

  start(): void {
    this.ensureWorker();
  }

  search(query: SearchQuery): Promise<SearchReply> {
    return this.request({ type: "search", query }) as Promise<SearchReply>;
  }

  autocomplete(q: string): Promise<AutocompleteReply> {
    return this.request({ type: "autocomplete", q }) as Promise<AutocompleteReply>;
  }

  facets(): Promise<FacetCounts> {
    return this.request({ type: "facets" }) as Promise<FacetCounts>;
  }

  status(): Promise<EngineStatus> {
    return this.request({ type: "status" }) as Promise<EngineStatus>;
  }

  // Applies any newly published batches now instead of at the next poll.
  sync(timeoutMs?: number): Promise<EngineStatus> {
    return this.request({ type: "sync" }, timeoutMs) as Promise<EngineStatus>;
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.rejectAll(new EngineUnavailableError("search engine is shutting down", "crashed"));
    if (worker) await worker.terminate();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    // A worker that keeps dying should not be respawned in a tight loop.
    if (Date.now() - this.lastStartAt < 1000) {
      throw new EngineUnavailableError("search engine worker is restarting", "crashed");
    }
    this.lastStartAt = Date.now();
    const worker = new Worker(this.options.workerPath, {
      workerData: { indexDir: this.options.indexDir, pollMs: this.options.pollMs } satisfies WorkerOptions,
    });
    worker.unref();
    worker.on("message", (response: WorkerResponse) => {
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new EngineUnavailableError(response.error.message, response.error.code));
    });
    const onGone = (error?: Error) => {
      if (this.worker !== worker) return;
      this.worker = null;
      this.rejectAll(new EngineUnavailableError(error?.message ?? "search engine worker exited", "crashed"));
    };
    worker.on("error", onGone);
    worker.on("exit", () => onGone());
    this.worker = worker;
    return worker;
  }

  private request(body: RequestBody, timeoutMs = this.options.requestTimeoutMs): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.ensureWorker();
      } catch (error) {
        reject(error as Error);
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EngineUnavailableError(`search engine did not answer within ${timeoutMs}ms`, "timeout"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, ...body } as WorkerRequest);
    });
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
