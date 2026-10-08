import type { FileDiff, FileDiffSummary } from "../bindings";

/** A changed path represented by either a patch or bounded summary metadata. */
export type ChangedFile = FileDiff | FileDiffSummary;

const NAME_ORDER = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

/** Locale-stable natural ordering with a code-point tie-break for determinism. */
export function compareNames(left: string, right: string): number {
  return (
    NAME_ORDER.compare(left, right) ||
    (left < right ? -1 : left > right ? 1 : 0)
  );
}
