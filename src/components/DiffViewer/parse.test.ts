import { describe, expect, it } from "vitest";

import { parseHunks } from "./parse";

const PATCH = `diff --git a/src/app.ts b/src/app.ts
index 1234567..89abcde 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;

describe("parseHunks", () => {
  it("drops the headers the panel already shows above the patch", () => {
    const kinds = parseHunks(PATCH).map((line) => line.text);

    expect(kinds.some((text) => text.startsWith("diff --git"))).toBe(false);
    expect(kinds.some((text) => text.startsWith("index "))).toBe(false);
    expect(kinds.some((text) => text.startsWith("--- a/"))).toBe(false);
    expect(kinds.some((text) => text.startsWith("+++ b/"))).toBe(false);
  });

  it("keeps hunk headers, which are the only sign that lines were skipped", () => {
    const meta = parseHunks(PATCH).filter((line) => line.kind === "meta");
    expect(meta[0]?.text).toBe("@@ -1,4 +1,5 @@");
  });

  it("classifies additions, deletions and context", () => {
    const lines = parseHunks(PATCH);

    expect(
      lines.filter((line) => line.kind === "add").map((l) => l.text),
    ).toEqual(["const b = 3;", "const c = 4;"]);
    expect(
      lines.filter((line) => line.kind === "del").map((l) => l.text),
    ).toEqual(["const b = 2;"]);
    expect(
      lines.filter((line) => line.kind === "context").map((l) => l.text),
    ).toEqual(["const a = 1;", "const d = 5;"]);
  });

  it("strips the marker but keeps leading whitespace of the code", () => {
    const lines = parseHunks("@@ -1 +1 @@\n+    indented();\n");
    expect(lines[1]?.text).toBe("    indented();");
  });

  it("keeps the missing-newline marker as information", () => {
    const lines = parseHunks(
      "@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n",
    );
    expect(lines.some((line) => line.text.startsWith("\\ No newline"))).toBe(
      true,
    );
  });

  it("shows a rename without repeating it as a header line", () => {
    const lines = parseHunks(
      "diff --git a/old.ts b/new.ts\nsimilarity index 95%\nrename from old.ts\nrename to new.ts\n@@ -1 +1 @@\n-a\n+b\n",
    );
    expect(lines.some((line) => line.text.startsWith("rename"))).toBe(false);
    expect(lines).toHaveLength(3);
  });

  it("returns nothing for an empty patch rather than a blank line", () => {
    expect(parseHunks("")).toEqual([]);
  });
});
