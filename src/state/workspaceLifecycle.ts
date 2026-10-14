import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { startWorkspacePersistence } from "./workspacePersistence";
import { useWorkspace } from "./workspace";

/** Saves before the native window closes; registration and save failures stay visible. */
export function useWorkspaceLifecycle(): void {
  useEffect(() => {
    const persistence = startWorkspacePersistence();
    const window = getCurrentWindow();
    let disposed = false;
    let closing = false;
    let unlisten: (() => void) | undefined;
    void window
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (closing) return;
        closing = true;
        try {
          await persistence.flush();
          await window.destroy();
        } catch (cause) {
          useWorkspace.getState().setStorageError(cause);
          closing = false;
        }
      })
      .then(
        (cleanup) => {
          if (disposed) cleanup();
          else unlisten = cleanup;
        },
        (cause: unknown) => {
          useWorkspace.getState().setStorageError(cause);
        },
      );
    return () => {
      disposed = true;
      unlisten?.();
      persistence.stop();
    };
  }, []);
}
