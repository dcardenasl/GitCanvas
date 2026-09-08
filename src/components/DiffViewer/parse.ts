/** One rendered line of a unified patch. */
export interface DiffLine {
  readonly kind: "add" | "del" | "context" | "meta";
  readonly text: string;
}

/**
 * Splits a unified patch into renderable lines.
 *
 * The `diff --git`, `index`, `---` and `+++` headers are dropped: the file
 * name and its change type already appear above the patch, and repeating them
 * inside it wastes the little vertical space the panel has. Hunk headers stay,
 * because they are the only signal that lines were skipped.
 */
export function parseHunks(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const raw of patch.split("\n")) {
    if (
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("new file mode") ||
      raw.startsWith("deleted file mode") ||
      raw.startsWith("similarity index") ||
      raw.startsWith("rename from") ||
      raw.startsWith("rename to")
    ) {
      continue;
    }

    if (raw.startsWith("@@")) {
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    if (raw.startsWith("\\")) {
      // "\ No newline at end of file" is information, not content.
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ kind: "add", text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith("-")) {
      lines.push({ kind: "del", text: raw.slice(1) });
      continue;
    }
    if (raw === "") continue;

    lines.push({
      kind: "context",
      text: raw.startsWith(" ") ? raw.slice(1) : raw,
    });
  }

  return lines;
}
