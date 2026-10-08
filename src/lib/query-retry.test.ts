import { describe, expect, it } from "vitest";

import { IpcError } from "./ipc";
import {
  queryRetryDelay,
  shouldRetryLocalRead,
  shouldRetryQuery,
} from "./query-retry";

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

describe("shouldRetryLocalRead", () => {
  const torn = new IpcError({
    kind: "WorktreeChanged",
    message: "changed while reading",
  });

  it("also retries a listing torn by a concurrent edit, a bounded number of times", () => {
    expect(shouldRetryLocalRead(0, torn)).toBe(true);
    expect(shouldRetryLocalRead(3, torn)).toBe(false);
  });

  it("keeps the general policy for everything else", () => {
    const exhausted = new IpcError({ kind: "ResourceExhausted", message: "x" });
    expect(shouldRetryLocalRead(0, exhausted)).toBe(true);
    expect(
      shouldRetryLocalRead(0, new IpcError({ kind: "Git", message: "x" })),
    ).toBe(false);
    // The general policy does not retry a torn read: only local reads do.
    expect(shouldRetryQuery(0, torn)).toBe(false);
  });
});
