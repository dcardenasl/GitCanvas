import { open } from "@tauri-apps/plugin-dialog";
import { useRef, useState } from "react";

import { afterPaint } from "../../lib/paint";
import { safeStorage } from "../../lib/safeStorage";
import { openProjectAt } from "../../state/openProject";

/** Where the picker last opened, so it starts there next time. */
const LAST_DIRECTORY_KEY = "gitcanvas.lastDirectory";

/** The directory the picker should start in, if one was remembered. */
function lastDirectory(): string | undefined {
  return safeStorage.get(LAST_DIRECTORY_KEY) ?? undefined;
}

function rememberDirectory(path: string): void {
  const parent = path.slice(0, path.lastIndexOf("/"));
  if (parent !== "") safeStorage.set(LAST_DIRECTORY_KEY, parent);
}

/** What opening a folder is doing right now. */
export type OpenFolderPhase = "idle" | "choosing" | "opening";

/** Opening a folder through the native picker, and what it is up to. */
export interface OpenFolder {
  readonly phase: OpenFolderPhase;
  /** The failure itself, not its text: it is translated where it is shown. */
  readonly error: { readonly cause: unknown } | null;
  /** Asks for a folder and opens it as a project. */
  readonly choose: () => void;
  /**
   * Opens folders the person dropped on the window as projects, in order,
   * until the tab limit stops it. Ignored while another open is under way.
   */
  readonly openDropped: (paths: readonly string[]) => void;
  readonly dismissError: () => void;
}

/**
 * Opens local folders as projects: through the native folder picker, or from
 * folders dropped on the window.
 *
 * Shared by everything that offers to open a folder, so the guard against a
 * second panel, the busy state and the failure handling exist once. A path from
 * a drop is no more trusted than one from the picker: either way the backend
 * decides whether it is a repository, and nothing is opened until it says so.
 *
 * @param onSelected - What to do with a folder the picker returned; by default
 * open it as a project. Dropped folders always open as projects, whatever this
 * is: a view that uses the picker for something else, such as locating a moved
 * project, does not listen for drops.
 */
export function useOpenFolder(
  onSelected: (path: string) => Promise<unknown> = openProjectAt,
): OpenFolder {
  const [error, setError] = useState<{ readonly cause: unknown } | null>(null);
  const [phase, setPhase] = useState<OpenFolderPhase>("idle");

  /*
   * Guards against a second panel, or a drop on top of one.
   *
   * macOS takes a noticeable moment to bring up NSOpenPanel the first time,
   * and a second click during that gap stacks a second panel behind the first.
   * A ref rather than the phase state, because the guard has to hold within
   * the same tick as the click that sets it.
   */
  const inFlight = useRef(false);

  async function run(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError({ cause });
    } finally {
      // Runs on cancel too, so the button cannot be left disabled by someone
      // dismissing the panel.
      setPhase("idle");
      inFlight.current = false;
    }
  }

  async function chooseFolder() {
    setPhase("choosing");
    /*
     * Wait for the spinner to actually reach the screen.
     *
     * The dialog plugin builds the panel with `run_on_main_thread`, and on
     * macOS the WebView paints on that same thread. Setting the busy state
     * and calling straight into the dialog means the thread is taken before
     * the browser ever renders it, so the button sits there looking dead for
     * the whole wait. Yielding for a paint first is what makes the state
     * visible at all.
     */
    await afterPaint();

    // The key is omitted rather than set to undefined: with
    // `exactOptionalPropertyTypes`, an explicit undefined is a different
    // thing from an absent option, and the plugin wants the latter.
    const remembered = lastDirectory();
    const selected = await open({
      directory: true,
      multiple: false,
      ...(remembered === undefined ? {} : { defaultPath: remembered }),
    });
    if (typeof selected !== "string") return;

    setPhase("opening");
    rememberDirectory(selected);
    await onSelected(selected);
  }

  async function openAll(paths: readonly string[]) {
    setPhase("opening");
    for (const path of paths) {
      // At the limit nothing more can open, and the notice already says so.
      if ((await openProjectAt(path)) === "limit") return;
    }
  }

  return {
    phase,
    error,
    choose: () => {
      void run(chooseFolder);
    },
    openDropped: (paths) => {
      if (paths.length === 0) return;
      void run(() => openAll(paths));
    },
    dismissError: () => {
      setError(null);
    },
  };
}
