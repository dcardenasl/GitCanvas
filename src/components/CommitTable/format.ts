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

const DEFAULT_LOCALE = "es";
const FORMATTER_CACHE_LIMIT = 8;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale?: string): Intl.DateTimeFormat {
  const key = locale ?? DEFAULT_LOCALE;
  const cached = dateFormatters.get(key);
  if (cached !== undefined) return cached;

  const formatter = new Intl.DateTimeFormat(key, {
    year: "numeric",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (dateFormatters.size >= FORMATTER_CACHE_LIMIT) {
    const oldest = dateFormatters.keys().next().value;
    if (oldest !== undefined) dateFormatters.delete(oldest);
  }
  dateFormatters.set(key, formatter);
  return formatter;
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

  return dateFormatter(locale).format(date);
}

/** Initials for the author avatar, at most two letters. */
export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}
