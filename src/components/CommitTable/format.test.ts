import { describe, expect, it } from "vitest";

import { authorInitials, formatCommitTime, shortId } from "./format";

describe("shortId", () => {
  it("abbreviates to Git's default display length", () => {
    expect(shortId("a424020f1c9b8e7d6a5f4e3d2c1b0a9f8e7d6c5b")).toBe("a424020");
  });

  it("leaves an already short id alone", () => {
    expect(shortId("abc")).toBe("abc");
  });
});

describe("formatCommitTime", () => {
  it("defaults to Spanish and includes the year", () => {
    expect(formatCommitTime("1788815520")).toMatch(/2026/);
  });

  it("formats decimal Unix seconds", () => {
    // 1788815520 is 2026-09-07T21:12:00Z. The rendered day depends on the
    // runner's zone, so both sides of midnight are accepted; what is being
    // asserted is that a real timestamp produces a real date.
    const formatted = formatCommitTime("1788815520", "en-GB");
    expect(formatted).toMatch(/0[78] Sept? 2026, \d{2}:\d{2}/);
  });

  it("rejects blank input instead of rendering the Unix epoch", () => {
    // Number("") is 0, which is finite. Without an explicit guard this would
    // render 01 Jan 1970 as though it were a commit date.
    expect(formatCommitTime("")).toBe("");
    expect(formatCommitTime("   ")).toBe("");
  });

  it("returns empty for values that are not finite seconds", () => {
    expect(formatCommitTime("not-a-number")).toBe("");
    expect(formatCommitTime("Infinity")).toBe("");
    expect(formatCommitTime("NaN")).toBe("");
  });

  it("survives a timestamp outside the representable date range", () => {
    // Git's range is wider than JavaScript's Date, so this must not throw.
    expect(formatCommitTime("999999999999999")).toBe("");
  });
});

describe("authorInitials", () => {
  it("takes the first and last name", () => {
    expect(authorInitials("David Cardenas Lorca")).toBe("DL");
  });

  it("takes one letter from a single name", () => {
    expect(authorInitials("David")).toBe("D");
  });

  it("falls back rather than rendering nothing", () => {
    expect(authorInitials("   ")).toBe("?");
  });
});
