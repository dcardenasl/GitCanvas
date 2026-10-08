import { describe, expect, it } from "vitest";

import type { FileDiffSummary } from "../../bindings";
import { buildFileTree } from "./tree";

function file(path: string): FileDiffSummary {
  return {
    path,
    old_path: null,
    change: "Modified",
    insertions: 0,
    deletions: 0,
    omitted: null,
  };
}

describe("buildFileTree", () => {
  it("groups nested files and sorts folders before files at each level", () => {
    const tree = buildFileTree([
      file("zeta.ts"),
      file("src/z.ts"),
      file("src/components/Panel.tsx"),
      file("src/app.ts"),
      file("README.md"),
    ]);

    expect(tree.entries.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      "directory:src",
      "file:README.md",
      "file:zeta.ts",
    ]);
    const src = tree.entries[0];
    expect(src?.kind).toBe("directory");
    if (src?.kind !== "directory") throw new Error("expected src directory");
    expect(src.fileCount).toBe(3);
    expect(src.entries.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      "directory:components",
      "file:app.ts",
      "file:z.ts",
    ]);
    expect(tree.directoryPaths).toEqual(["src", "src/components"]);
  });

  it("sorts numbered entries naturally and preserves the original file path", () => {
    const tree = buildFileTree([file("src/file10.ts"), file("src/file2.ts")]);
    const src = tree.entries[0];

    expect(src?.kind).toBe("directory");
    if (src?.kind !== "directory") throw new Error("expected src directory");
    expect(src.entries.map(({ name }) => name)).toEqual([
      "file2.ts",
      "file10.ts",
    ]);
    expect(src.entries[0]?.kind === "file" && src.entries[0].file.path).toBe(
      "src/file2.ts",
    );
  });

  it("keeps root files and file/directory name collisions distinct", () => {
    const tree = buildFileTree([file("module"), file("module/index.ts")]);

    expect(tree.entries.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      "directory:module",
      "file:module",
    ]);
  });
});
