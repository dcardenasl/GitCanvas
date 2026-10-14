/** A shortcut as the platform writes it: `⌘O` on macOS, `Ctrl+O` elsewhere. */
export function shortcutLabel(key: string, shift = false): string {
  if (isMacPlatform()) return `${shift ? "⇧" : ""}⌘${key}`;
  return `Ctrl+${shift ? "Shift+" : ""}${key}`;
}

/** Whether the application is running on macOS, where shortcuts use ⌘. */
export function isMacPlatform(): boolean {
  return navigator.userAgent.includes("Macintosh");
}
