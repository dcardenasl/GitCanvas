/**
 * Presentation helpers for commit fields.
 *
 * Times arrive as decimal Unix seconds in a string, because Git's range does
 * not fit a JavaScript number safely. Parsing happens here, once.
 */

/** Abbreviated commit id, matching Git's default display length. */
export function shortId(id: string): string {
  return id.slice(0, 7);
}

/**
 * Formats a commit time for the history table.
 *
 * Returns an empty string for values that are not finite seconds rather than
 * rendering "Invalid Date" into the interface.
 */
export function formatCommitTime(unixSeconds: string, locale?: string): string {
  // `Number("")` and `Number("  ")` are both 0, which is a perfectly finite
  // number and would render the Unix epoch as if it were a real commit date.
  // Blank input has to be rejected before the conversion, not after it.
  if (unixSeconds.trim() === "") return "";

  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds)) return "";

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Initials for the author avatar, at most two letters. */
export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}
