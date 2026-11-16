/** Formats a bounded decimal byte count for image metadata and notices. */
export function formatImageBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return value;
  if (bytes < 1_000) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let scaled = bytes;
  let unit = -1;
  while (scaled >= 1_000 && unit < units.length - 1) {
    scaled /= 1_000;
    unit += 1;
  }
  const unitName = units.at(unit) ?? "GB";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(scaled)} ${unitName}`;
}
