/** One rendered line of a unified patch. */
export interface DiffLine {
  readonly kind: "add" | "del" | "context" | "meta";
  readonly text: string;
  /** Line number in the parent revision, or `null` for an addition. */
  readonly oldLine: number | null;
  /** Line number in this revision, or `null` for a deletion. */
  readonly newLine: number | null;
}

/** `@@ -12,7 +12,9 @@` — the starting line on each side of a hunk. */
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Headers the panel already shows above the patch, so they are dropped. */
const DROPPED = [
  "diff --git",
  "index ",
  "--- ",
  "+++ ",
  "new file mode",
  "deleted file mode",
  "similarity index",
  "rename from",
  "rename to",
];

/**
 * Splits a unified patch into renderable lines, numbered on both sides.
 *
 * Numbers come from the hunk headers rather than from counting rows: a patch
 * skips everything between hunks, so a running counter would drift the moment
 * the second hunk started.
 *
 * Hunk headers stay, because they are the only signal that lines were skipped.
 */
export function parseHunks(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    if (DROPPED.some((prefix) => raw.startsWith(prefix))) continue;

    const hunk = HUNK.exec(raw);
    if (hunk !== null) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ kind: "meta", text: raw, oldLine: null, newLine: null });
      continue;
    }

    if (raw.startsWith("\\")) {
      // "\ No newline at end of file" is information, not content, and belongs
      // to the line above rather than to a line of its own.
      lines.push({ kind: "meta", text: raw, oldLine: null, newLine: null });
      continue;
    }

    if (raw.startsWith("+")) {
      lines.push({
        kind: "add",
        text: raw.slice(1),
        oldLine: null,
        newLine: newLine++,
      });
      continue;
    }

    if (raw.startsWith("-")) {
      lines.push({
        kind: "del",
        text: raw.slice(1),
        oldLine: oldLine++,
        newLine: null,
      });
      continue;
    }

    if (raw === "") continue;

    lines.push({
      kind: "context",
      text: raw.startsWith(" ") ? raw.slice(1) : raw,
      oldLine: oldLine++,
      newLine: newLine++,
    });
  }

  return lines;
}

/** Splits a whole file into the same shape, so one renderer handles both. */
export function parseWholeFile(text: string): DiffLine[] {
  const rows = text.split("\n");
  // A trailing newline produces a final empty element that is not a line.
  if (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();

  return rows.map((line, index) => ({
    kind: "context" as const,
    text: line,
    oldLine: null,
    newLine: index + 1,
  }));
}
