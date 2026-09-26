import { describe, expect, it } from "vitest";

import { pollInterval } from "./worktree";

describe("pollInterval", () => {
  it("uses the base interval while polls are cheap", () => {
    expect(pollInterval(5_000, 0)).toBe(5_000);
    expect(pollInterval(5_000, 40)).toBe(5_000);
    expect(pollInterval(2_000, 40)).toBe(2_000);
  });

  it("leaves ten times the cost of a poll before the next one", () => {
    expect(pollInterval(5_000, 800)).toBe(8_000);
    expect(pollInterval(2_000, 1_500)).toBe(15_000);
  });

  it("never waits longer than a minute", () => {
    expect(pollInterval(5_000, 60_000)).toBe(60_000);
  });
});
