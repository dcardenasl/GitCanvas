import { describe, expect, it } from "vitest";

import { IpcError } from "./ipc";
import { queryRetryDelay, shouldRetryQuery } from "./query-retry";

describe("shouldRetryQuery", () => {
  const exhausted = new IpcError({
    kind: "ResourceExhausted",
    message: "too many open files",
  });

  it("retries descriptor exhaustion a bounded number of times", () => {
    expect(shouldRetryQuery(0, exhausted)).toBe(true);
    expect(shouldRetryQuery(2, exhausted)).toBe(true);
    expect(shouldRetryQuery(3, exhausted)).toBe(false);
  });

  it("does not retry a real failure, whatever its message says", () => {
    const real = new IpcError({
      kind: "Git",
      message: "Too many open files in the message text",
    });
    expect(shouldRetryQuery(0, real)).toBe(false);
    expect(shouldRetryQuery(0, new Error("EMFILE"))).toBe(false);
    expect(shouldRetryQuery(0, "boom")).toBe(false);
  });

  it("backs off exponentially up to one second", () => {
    expect([0, 1, 2, 3, 4].map(queryRetryDelay)).toEqual([
      100, 200, 400, 800, 1000,
    ]);
  });
});
