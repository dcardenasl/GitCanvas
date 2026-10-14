/** A shortcut as the platform writes it: `⌘O` on macOS, `Ctrl+O` elsewhere. */
export function shortcutLabel(key: string): string {
  return isMacPlatform() ? `⌘${key}` : `Ctrl+${key}`;
}

/** Whether the application is running on macOS, where shortcuts use ⌘. */
export function isMacPlatform(): boolean {
  return navigator.userAgent.includes("Macintosh");
}
