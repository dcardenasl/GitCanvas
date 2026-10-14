import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";

/**
 * Follows folders dragged over the window and hands over the ones dropped.
 *
 * The operating system delivers the drag as events carrying the dropped paths,
 * which is why the webview's own HTML5 drag and drop is not involved. Returns
 * whether something is being dragged over the window right now, so the
 * interface can say where it would land.
 *
 * @param onDrop - Receives the paths dropped, in the order the system gave them.
 * @returns Whether a drag is over the window.
 */
export function useDroppedFolders(
  onDrop: (paths: readonly string[]) => void,
): boolean {
  const [over, setOver] = useState(false);
  const latest = useRef(onDrop);
  useEffect(() => {
    latest.current = onDrop;
  });

  useEffect(() => {
    let disposed = false;
    // Dropping is a convenience on top of Open: if the system will not deliver
    // drag events, the window is exactly as usable as it was without them.
    const listening = getCurrentWebview().onDragDropEvent(({ payload }) => {
      switch (payload.type) {
        case "enter":
        case "over":
          setOver(true);
          break;
        case "leave":
          setOver(false);
          break;
        case "drop":
          setOver(false);
          latest.current(payload.paths);
          break;
      }
    });
    return () => {
      disposed = true;
      listening.then(
        (stop) => {
          // Registered after this effect was torn down, such as by a remount.
          if (disposed) stop();
        },
        () => undefined,
      );
    };
  }, []);

  return over;
}
