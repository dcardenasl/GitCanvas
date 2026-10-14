/** What a key chord asks of the row of tabs. */
export type TabShortcut =
  | { readonly kind: "next" }
  | { readonly kind: "previous" }
  | { readonly kind: "position"; readonly position: number }
  | { readonly kind: "open" }
  | { readonly kind: "close" };

/** The parts of a key event a shortcut depends on. */
export interface Chord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** Input types in which typing produces text, and so owns most chords. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "password",
  "email",
  "url",
  "tel",
  "number",
]);

/** Whether the keyboard is currently typing into something. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return (
    target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)
  );
}

/**
 * What a key chord means for the tabs, if anything.
 *
 * - `Ctrl+Tab` and `Ctrl+Shift+Tab` walk the row, and `⌘1`–`⌘8` (`Ctrl` off
 *   macOS) jump to a tab, `9` to the last. They mean nothing in a text field,
 *   so they work there too.
 * - Open and Close are `Ctrl+O` and `Ctrl+W` off macOS, and are left to the
 *   field while typing. On macOS they belong to the native menu, which owns
 *   `⌘O` and `⌘W` before the page sees them, so this returns nothing for them.
 *
 * Pure, so every chord can be checked without a keyboard.
 */
export function tabShortcut(
  chord: Chord,
  mac: boolean,
  typing: boolean,
): TabShortcut | null {
  const key = chord.key.toLowerCase();

  if (chord.ctrlKey && !chord.metaKey && !chord.altKey && key === "tab") {
    return { kind: chord.shiftKey ? "previous" : "next" };
  }

  const primary = mac
    ? chord.metaKey && !chord.ctrlKey
    : chord.ctrlKey && !chord.metaKey;
  if (!primary || chord.altKey || chord.shiftKey) return null;

  if (/^[1-9]$/.test(key)) return { kind: "position", position: Number(key) };
  if (mac || typing) return null;
  if (key === "o") return { kind: "open" };
  if (key === "w") return { kind: "close" };
  return null;
}
