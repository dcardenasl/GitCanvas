import { describe, expect, it } from "vitest";

import { parseHunks, parseWholeFile } from "./parse";

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

describe("line numbers", () => {
  it("numbers both sides from the hunk header, not by counting rows", () => {
    // A patch skips everything between hunks, so a running counter would drift
    // the moment the second hunk started.
    const lines = parseHunks(
      "@@ -10,3 +20,4 @@\n a\n-b\n+c\n+d\n@@ -100,2 +200,2 @@\n x\n y\n",
    );

    const context = lines.filter((line) => line.kind === "context");
    expect(context[0]).toMatchObject({ oldLine: 10, newLine: 20 });
    // After the second header, numbering restarts from it.
    expect(context[1]).toMatchObject({ oldLine: 100, newLine: 200 });
    expect(context[2]).toMatchObject({ oldLine: 101, newLine: 201 });
  });

  it("gives an addition only a new-side number", () => {
    const [, add] = parseHunks("@@ -1,1 +1,2 @@\n a\n+b\n");
    expect(add).toMatchObject({ kind: "context" });

    const lines = parseHunks("@@ -1,1 +1,2 @@\n a\n+b\n");
    const addition = lines.find((line) => line.kind === "add");
    expect(addition?.oldLine).toBeNull();
    expect(addition?.newLine).toBe(2);
  });

  it("gives a deletion only an old-side number", () => {
    const lines = parseHunks("@@ -1,2 +1,1 @@\n a\n-b\n");
    const deletion = lines.find((line) => line.kind === "del");
    expect(deletion?.oldLine).toBe(2);
    expect(deletion?.newLine).toBeNull();
  });

  it("leaves hunk headers unnumbered", () => {
    const [header] = parseHunks("@@ -1 +1 @@\n a\n");
    expect(header).toMatchObject({
      kind: "meta",
      oldLine: null,
      newLine: null,
    });
  });

  it("parses a hunk header without line counts", () => {
    // `@@ -1 +1 @@` is valid when the hunk is a single line.
    const lines = parseHunks("@@ -7 +9 @@\n a\n");
    const context = lines.find((line) => line.kind === "context");
    expect(context).toMatchObject({ oldLine: 7, newLine: 9 });
  });
});

describe("parseWholeFile", () => {
  it("numbers every line from one", () => {
    const lines = parseWholeFile("first\nsecond\nthird\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ text: "first", newLine: 1 });
    expect(lines[2]).toMatchObject({ text: "third", newLine: 3 });
  });

  it("does not invent a line for the trailing newline", () => {
    expect(parseWholeFile("only\n")).toHaveLength(1);
  });

  it("keeps a file that does not end in a newline", () => {
    expect(parseWholeFile("no trailing newline")).toHaveLength(1);
  });

  it("keeps blank lines, which are part of the file", () => {
    expect(parseWholeFile("a\n\nb\n")).toHaveLength(3);
  });

  it("returns nothing for an empty file", () => {
    expect(parseWholeFile("")).toEqual([]);
  });
});
