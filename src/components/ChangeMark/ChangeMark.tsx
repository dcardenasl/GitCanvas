import "./ChangeMark.css";

/** The kinds of change a file can carry, in the lower case the stylesheet names them. */
export type ChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechanged"
  | "other"
  | "unchanged";

const LETTER: Record<ChangeKind, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  typechanged: "T",
  other: "?",
  unchanged: "\u00b7",
};

/**
 * The square mark that names a file's change, shared by every list that shows
 * files so the same change reads the same way everywhere.
 */
export function ChangeMark({
  kind,
  label,
}: {
  readonly kind: ChangeKind;
  /** What the letter means, for a tooltip and for assistive technology. */
  readonly label: string;
}) {
  return (
    <span
      className={`change-mark change-mark--${kind}`}
      title={label}
      aria-label={label}
    >
      {LETTER[kind]}
    </span>
  );
}
