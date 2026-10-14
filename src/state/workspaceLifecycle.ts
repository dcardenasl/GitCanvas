import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

import { acknowledgeShutdown } from "../lib/ipc";
import { startWorkspacePersistence } from "./workspacePersistence";
import { useWorkspace } from "./workspace";

/** Saves before the native window closes; registration and save failures stay visible. */
export function useWorkspaceLifecycle(): { readonly retry: () => void } {
  const retry = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const persistence = startWorkspacePersistence();
    const window = getCurrentWindow();
    let disposed = false;
    let closing = false;
    let unlisten: (() => void) | undefined;
    let registering: Promise<void> | null = null;

    function register(): Promise<void> {
      if (unlisten !== undefined || disposed) return Promise.resolve();
      if (registering !== null) return registering;
      registering = window
        .onCloseRequested(async (event) => {
          event.preventDefault();
          if (closing) return;
          closing = true;
          try {
            // First, before anything that can take time: the backend destroys
            // a window whose close request nobody acknowledges.
            await acknowledgeShutdown();
            await persistence.flush();
            await window.destroy();
          } catch (cause) {
            useWorkspace.getState().setStorageError(cause);
            closing = false;
          }
        })
        .then((cleanup) => {
          if (disposed) cleanup();
          else unlisten = cleanup;
        })
        .finally(() => {
          registering = null;
        });
      return registering;
    }

    const run = async () => {
      try {
        await register();
        await persistence.flush();
        if (!disposed) useWorkspace.getState().setStorageError(null);
      } catch (cause) {
        if (!disposed) useWorkspace.getState().setStorageError(cause);
      }
    };
    retry.current = run;
    void run();
    return () => {
      disposed = true;
      unlisten?.();
      persistence.stop();
      if (retry.current === run) retry.current = null;
    };
  }, []);
  return {
    retry: () => {
      void retry.current?.();
    },
  };
}
