/**
 * Waits until the browser has painted.
 *
 * Some work seizes the main thread, and on macOS the WebView paints on that
 * same thread: a busy state set immediately before such a call never reaches
 * the screen, because there is no frame between the state change and the
 * thread being taken. Two frames are needed — the first is scheduled before
 * the pending render commits, the second runs after it has been painted.
 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}
