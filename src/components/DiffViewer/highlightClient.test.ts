import { describe, expect, it, vi } from "vitest";

import { createHighlightClient, type HighlightWorker } from "./highlightClient";
import type {
  HighlightJob,
  HighlightRequest,
  HighlightResponse,
} from "./highlightProtocol";

class FakeWorker implements HighlightWorker {
  readonly requests: HighlightRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<HighlightResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  postMessage(request: HighlightRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  answer(response: HighlightResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<HighlightResponse>);
  }
}

const job = (text: string): HighlightJob => ({
  mode: "source",
  language: "json",
  lines: [text],
});

const ROWS = [[{ text: "x", categories: [] }]] as const;

function setup() {
  const workers: FakeWorker[] = [];
  const client = createHighlightClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

describe("highlight client", () => {
  it("starts no worker until the first job", () => {
    const { workers } = setup();
    expect(workers).toHaveLength(0);
  });

  it("resolves a job with the rows the worker answers", async () => {
    const { client, workers } = setup();
    const pending = client.highlight(job("a"), new AbortController().signal);

    const request = workers[0]?.requests[0];
    expect(request?.job).toEqual(job("a"));
    workers[0]?.answer({ id: request?.id ?? -1, rows: ROWS });

    await expect(pending).resolves.toEqual(ROWS);
  });

  it("runs jobs one at a time, in order, on a single worker", async () => {
    const { client, workers } = setup();
    const signal = new AbortController().signal;
    const first = client.highlight(job("a"), signal);
    const second = client.highlight(job("b"), signal);

    expect(workers).toHaveLength(1);
    expect(workers[0]?.requests).toHaveLength(1);

    workers[0]?.answer({ id: workers[0].requests[0]?.id ?? -1, rows: ROWS });
    await first;
    expect(workers[0]?.requests).toHaveLength(2);

    workers[0]?.answer({ id: workers[0].requests[1]?.id ?? -1, rows: ROWS });
    await expect(second).resolves.toEqual(ROWS);
  });

  it("rejects with the worker's message when a job fails", async () => {
    const { client, workers } = setup();
    const pending = client.highlight(job("a"), new AbortController().signal);

    workers[0]?.answer({
      id: workers[0].requests[0]?.id ?? -1,
      error: "bad grammar",
    });

    await expect(pending).rejects.toThrow("bad grammar");
  });

  it("ignores answers that match no running job", async () => {
    const { client, workers } = setup();
    const pending = client.highlight(job("a"), new AbortController().signal);

    workers[0]?.answer({ id: 999, rows: ROWS });
    workers[0]?.answer({ id: workers[0].requests[0]?.id ?? -1, rows: ROWS });

    await expect(pending).resolves.toEqual(ROWS);
  });

  it("drops a queued job whose consumer aborted without running it", async () => {
    const { client, workers } = setup();
    const running = client.highlight(job("a"), new AbortController().signal);
    const controller = new AbortController();
    const dropped = client.highlight(job("b"), controller.signal);
    const kept = client.highlight(job("c"), new AbortController().signal);

    controller.abort();
    await expect(dropped).rejects.toMatchObject({ name: "AbortError" });

    workers[0]?.answer({ id: workers[0].requests[0]?.id ?? -1, rows: ROWS });
    await running;
    expect(workers[0]?.requests.map((r) => r.job)).toEqual([
      job("a"),
      job("c"),
    ]);
    workers[0]?.answer({ id: workers[0].requests[1]?.id ?? -1, rows: ROWS });
    await expect(kept).resolves.toEqual(ROWS);
  });

  it("ends the worker when the running job is aborted and starts a new one for the next", async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    const aborted = client.highlight(job("a"), controller.signal);
    const next = client.highlight(job("b"), new AbortController().signal);

    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[1]?.answer({ id: workers[1].requests[0]?.id ?? -1, rows: ROWS });
    await expect(next).resolves.toEqual(ROWS);
  });

  it("rejects immediately for a signal that is already aborted", async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.highlight(job("a"), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(0);
  });

  it("does nothing when a finished job is aborted afterwards", async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    const pending = client.highlight(job("a"), controller.signal);
    workers[0]?.answer({ id: workers[0].requests[0]?.id ?? -1, rows: ROWS });
    await pending;

    controller.abort();

    expect(workers[0]?.terminated).toBe(false);
  });

  it("rejects only the running job when the worker crashes, then carries on", async () => {
    const { client, workers } = setup();
    const crashed = client.highlight(job("a"), new AbortController().signal);
    const next = client.highlight(job("b"), new AbortController().signal);

    workers[0]?.onerror?.({} as ErrorEvent);
    await expect(crashed).rejects.toThrow("failed");

    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[1]?.answer({ id: workers[1].requests[0]?.id ?? -1, rows: ROWS });
    await expect(next).resolves.toEqual(ROWS);
  });

  it("treats an unreadable message as a crash", async () => {
    const { client, workers } = setup();
    const pending = client.highlight(job("a"), new AbortController().signal);

    workers[0]?.onmessageerror?.({} as MessageEvent);

    await expect(pending).rejects.toThrow("bad data");
  });

  it("ignores events from a worker it already discarded", async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    const first = client.highlight(job("a"), controller.signal);
    controller.abort();
    await expect(first).rejects.toBeDefined();
    const second = client.highlight(job("b"), new AbortController().signal);

    // Handlers are detached on discard; a late event on the old worker is inert.
    expect(workers[0]?.onerror).toBeNull();
    workers[1]?.answer({ id: workers[1].requests[0]?.id ?? -1, rows: ROWS });
    await expect(second).resolves.toEqual(ROWS);
  });

  it("rejects every queued job when no worker can be started", async () => {
    const spawn = vi.fn(() => {
      throw new Error("Worker is not defined");
    });
    const client = createHighlightClient(spawn);
    const signal = new AbortController().signal;

    const results = await Promise.allSettled([
      client.highlight(job("a"), signal),
      client.highlight(job("b"), signal),
    ]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("rejects when posting to the worker throws", async () => {
    const worker = new FakeWorker();
    worker.postMessage = () => {
      throw new Error("DataCloneError");
    };
    const client = createHighlightClient(() => worker);

    await expect(
      client.highlight(job("a"), new AbortController().signal),
    ).rejects.toThrow("DataCloneError");
    expect(worker.terminated).toBe(true);
  });
});
