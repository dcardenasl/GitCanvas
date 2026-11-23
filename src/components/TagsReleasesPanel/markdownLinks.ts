/** Resolves a Markdown destination to an HTTPS URL for the native opener. */
export function resolveMarkdownLink(
  destination: string | undefined,
  releaseUrl: string | null | undefined,
): string | null {
  if (destination === undefined || destination.length === 0) return null;
  try {
    const base =
      releaseUrl === null || releaseUrl === undefined
        ? undefined
        : new URL(releaseUrl);
    if (
      base !== undefined &&
      (base.protocol !== "https:" ||
        base.username !== "" ||
        base.password !== "" ||
        base.hostname === "")
    )
      return null;

    const target =
      base === undefined ? new URL(destination) : new URL(destination, base);
    if (
      target.protocol !== "https:" ||
      target.hostname === "" ||
      target.username !== "" ||
      target.password !== "" ||
      target.href.length > 8192 ||
      hasControlCharacters(destination)
    )
      return null;
    return target.href;
  } catch {
    return null;
  }
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 32 || codePoint === 127))
      return true;
  }
  return false;
}
