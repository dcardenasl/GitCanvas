import type { ReleaseListEntryIpc } from "../../bindings";

/** Stable release with the greatest valid publication date, preserving list order on ties. */
/** Returns the stable release with the newest valid publication timestamp. */
export function latestStableReleaseId(
  entries: readonly ReleaseListEntryIpc[],
): string | null {
  let latest: { readonly id: string; readonly publishedAt: number } | null =
    null;
  for (const entry of entries) {
    if (entry.kind !== "release" || entry.release.prerelease) continue;
    const publishedAt = Date.parse(entry.release.published_at ?? "");
    if (Number.isNaN(publishedAt)) continue;
    if (latest === null || publishedAt > latest.publishedAt)
      latest = { id: entry.release.id, publishedAt };
  }
  return latest?.id ?? null;
}

/** Formats release metadata dates (ISO-8601 or Unix epoch seconds) using the active application locale. */
export function formatReleaseDate(value: string, locale: string): string {
  const trimmed = value.trim();
  const date = /^\d+$/.test(trimmed)
    ? new Date(Number(trimmed) * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
