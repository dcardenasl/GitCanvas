/** Whether the application is running on macOS, where shortcuts use ⌘. */
export function isMacPlatform(): boolean {
  return navigator.userAgent.includes("Macintosh");
}
