/**
 * Copies text to the clipboard.
 *
 * Reports whether it worked rather than throwing: a failed copy is a thing to
 * tell the user about, not an error that should unwind a click handler. The
 * clipboard API rejects in contexts the application cannot detect in advance.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
