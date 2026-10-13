import type {
  HighlightJob,
  HighlightRequest,
  HighlightResponse,
  HighlightRows,
} from "./highlightProtocol";

/** The subset of `Worker` the client drives; tests provide their own. */
export interface HighlightWorker {
  postMessage(request: HighlightRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<HighlightResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}

/** Tokenizes jobs somewhere other than the caller's thread. */
export interface HighlightClient {
  /**
   * Resolves with the tokenized rows. Aborting the signal rejects the promise
   * and, when the job is already running, stops it. Any other rejection means
   * highlighting is unavailable and the caller should show plain text.
   */
  highlight(job: HighlightJob, signal: AbortSignal): Promise<HighlightRows>;
}

interface Entry {
  readonly id: number;
  readonly job: HighlightJob;
  readonly signal: AbortSignal;
  readonly resolve: (rows: HighlightRows) => void;
  readonly reject: (reason: Error) => void;
  readonly onAbort: () => void;
}

function abortError(): Error {
  return new DOMException("Syntax highlighting was cancelled", "AbortError");
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * A client for one lazily started worker.
 *
 * Jobs run one at a time, in order, so a job that is still queued can be
 * dropped for free when its consumer goes away. Aborting the running job ends
 * the worker, which is cheaper than waiting out a large file nobody will read;
 * the next job starts a fresh one. A crash rejects only the running job: the
 * queue carries on with a new worker, so one bad input cannot wedge the rest.
 */
export function createHighlightClient(
  spawn: () => HighlightWorker,
): HighlightClient {
  let worker: HighlightWorker | null = null;
  let active: Entry | null = null;
  let nextId = 0;
  const queue: Entry[] = [];

  function discardWorker(): void {
    if (worker === null) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    worker = null;
  }

  function release(entry: Entry): void {
    entry.signal.removeEventListener("abort", entry.onAbort);
  }

  function failActive(reason: Error): void {
    const entry = active;
    active = null;
    if (entry !== null) {
      release(entry);
      entry.reject(reason);
    }
  }

  function start(): HighlightWorker {
    if (worker !== null) return worker;
    const started = spawn();
    started.onmessage = (event) => {
      const response = event.data;
      const entry = active;
      if (entry?.id !== response.id) return;
      active = null;
      release(entry);
      if ("error" in response) entry.reject(new Error(response.error));
      else entry.resolve(response.rows);
      pump();
    };
    const crashed = (message: string) => () => {
      if (worker !== started) return;
      discardWorker();
      failActive(new Error(message));
      pump();
    };
    started.onerror = crashed("The highlighting worker failed");
    started.onmessageerror = crashed("The highlighting worker sent bad data");
    worker = started;
    return started;
  }

  function pump(): void {
    if (active !== null) return;
    const entry = queue.shift();
    if (entry === undefined) return;
    active = entry;
    try {
      start().postMessage({ id: entry.id, job: entry.job });
    } catch (error) {
      discardWorker();
      failActive(asError(error));
      pump();
    }
  }

  function cancel(entry: Entry): void {
    if (entry === active) {
      discardWorker();
      active = null;
    } else {
      const index = queue.indexOf(entry);
      if (index >= 0) queue.splice(index, 1);
    }
    entry.reject(abortError());
    pump();
  }

  return {
    highlight(job, signal) {
      return new Promise<HighlightRows>((resolve, reject) => {
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        const entry: Entry = {
          id: nextId++,
          job,
          signal,
          resolve,
          reject,
          onAbort: () => {
            cancel(entry);
          },
        };
        signal.addEventListener("abort", entry.onAbort, { once: true });
        queue.push(entry);
        pump();
      });
    },
  };
}
