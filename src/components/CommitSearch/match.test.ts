import { describe, expect, it } from "vitest";

import type { CommitInfo } from "../../bindings";

import { findMatches, matches } from "./match";

function commit(overrides: Partial<CommitInfo> = {}): CommitInfo {
  return {
    id: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    parents: [],
    summary: "feat(graph): add the resumable lane layout",
    message: "feat(graph): add the resumable lane layout\n\nWith detail.",
    author_name: "David Cardenas",
    author_email: "david@example.com",
    author_time: "1788815520",
    commit_time: "1788815520",
    ...overrides,
  };
}

describe("matches", () => {
  it("finds a commit by an abbreviated hash, the way git show accepts one", () => {
    expect(matches(commit(), "a1b2c3d")).toBe(true);
    expect(matches(commit(), "A1B2C3D")).toBe(true);
  });

  it("does not match a hash fragment from the middle", () => {
    // Prefix only: `git show` resolves prefixes, not substrings, and matching
    // the middle would surface commits nobody was looking for.
    expect(matches(commit(), "8f9012")).toBe(false);
  });

  it("finds a commit by words in its message", () => {
    expect(matches(commit(), "resumable lane")).toBe(true);
    expect(matches(commit(), "RESUMABLE")).toBe(true);
  });

  it("searches the full message, not only the summary", () => {
    expect(matches(commit(), "With detail")).toBe(true);
  });

  it("finds a commit by author name or address", () => {
    expect(matches(commit(), "cardenas")).toBe(true);
    expect(matches(commit(), "david@example")).toBe(true);
  });

  it("treats an empty or blank query as matching nothing", () => {
    // Returning everything for an empty query would make the count meaningless
    // the moment the field is cleared.
    expect(matches(commit(), "")).toBe(false);
    expect(matches(commit(), "   ")).toBe(false);
  });
});

describe("findMatches", () => {
  const history = [
    commit({ id: "1".repeat(40), summary: "feat: one", message: "feat: one" }),
    commit({ id: "2".repeat(40), summary: "fix: two", message: "fix: two" }),
    commit({
      id: "3".repeat(40),
      summary: "feat: three",
      message: "feat: three",
    }),
  ];

  it("returns every match in history order", () => {
    expect(findMatches(history, "feat")).toEqual([0, 2]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(findMatches(history, "nonexistent")).toEqual([]);
  });

  it("returns nothing for a blank query", () => {
    expect(findMatches(history, "  ")).toEqual([]);
  });
});
