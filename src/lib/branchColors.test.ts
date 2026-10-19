import { describe, expect, it } from "vitest";
import type { BranchInfo, RepositoryRefsSnapshot } from "../bindings";
import {
  colorByReference,
  colorGroups,
  editBranchColor,
  reconcileColors,
  visualPrincipal,
} from "./branchColors";

function branch(name: string, upstream: string | null = null): BranchInfo {
  return {
    name,
    full_name: name,
    target: "a",
    upstream,
    is_symbolic: false,
    symbolic_target: null,
    is_head: false,
    is_remote: name.startsWith("refs/remotes/"),
  };
}
function snapshot(branches: BranchInfo[]): RepositoryRefsSnapshot {
  return { branches, tags: [], head: null, head_reference: null, roots: ["a"] };
}
const main = "refs/heads/main";
const remote = "refs/remotes/origin/trunk";

describe("branch color identity", () => {
  it("groups by configured tracking, including several locals and cycles", () => {
    expect(
      colorGroups([
        branch(main, remote),
        branch("refs/heads/other", remote),
        branch(remote),
      ]),
    ).toEqual([[main, "refs/heads/other", remote]]);
    expect(
      colorGroups([branch(main, remote), branch(remote, main)]),
    ).toHaveLength(1);
  });
  it("retains colors across closure, disappearance and reappearance", () => {
    const first = reconcileColors("/repo", [branch(main)]);
    const edited = editBranchColor(first, [branch(main)], main, "blue");
    expect(reconcileColors("/repo", [], edited)).toEqual(edited);
    expect(reconcileColors("/repo", [branch(main)], edited)).toEqual(edited);
  });
  it("uses the last explicit edit when linking upstream and updates the whole group", () => {
    const independent = [branch(main), branch(remote)];
    let saved = reconcileColors("/repo", independent);
    saved = editBranchColor(saved, independent, main, "teal");
    saved = editBranchColor(saved, independent, remote, "rose");
    const linked = [branch(main, remote), branch(remote)];
    const joined = reconcileColors("/repo", linked, saved);
    expect([...colorByReference(joined).values()]).toEqual(["rose", "rose"]);
    const next = editBranchColor(joined, linked, main, "blue");
    expect(
      next.colors.every(
        (color) => color.color === "blue" && color.edited === 3,
      ),
    ).toBe(true);
  });
  it("does not recolor existing preferences when exhausting the palette", () => {
    const first = reconcileColors("/repo", [branch(main)]);
    const many = Array.from({ length: 40 }, (_, i) =>
      branch(`refs/heads/b${String(i)}`),
    );
    const next = reconcileColors("/repo", [branch(main), ...many], first);
    expect(colorByReference(next).get(main)).toBe(
      colorByReference(first).get(main),
    );
    expect(new Set(next.colors.map((color) => color.color)).size).toBe(8);
  });
  it("detects origin's default by actual upstream and preserves an absent explicit preference", () => {
    const refs = snapshot([
      branch(main, remote),
      branch(remote),
      {
        ...branch("refs/remotes/origin/HEAD"),
        is_symbolic: true,
        symbolic_target: remote,
      },
    ]);
    expect(visualPrincipal(refs, null)).toEqual({
      reference: main,
      status: "detected",
    });
    expect(visualPrincipal(refs, "refs/heads/gone").status).toBe("missing");
    expect(visualPrincipal(refs, remote)).toEqual({
      reference: remote,
      status: "selected",
    });
  });
});

it("does not mistake a local symbolic alias for a remote default", () => {
  const refs = snapshot([
    branch(main),
    {
      ...branch("refs/heads/local/HEAD"),
      is_symbolic: true,
      symbolic_target: main,
    },
  ]);
  expect(visualPrincipal(refs, null)).toEqual({
    reference: main,
    status: "choose",
  });
});
