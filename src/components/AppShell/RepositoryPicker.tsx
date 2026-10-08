import { open } from "@tauri-apps/plugin-dialog";
import { useRef, useState } from "react";

import { userMessage } from "../../lib/errors";
import { openRepository } from "../../lib/ipc";
import { afterPaint } from "../../lib/paint";
import { safeStorage } from "../../lib/safeStorage";
import { useSession } from "../../state/session";

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

/** What the button is doing right now. */
type Phase = "idle" | "choosing" | "opening";

/** Opens a local repository through the native folder picker. */
export function RepositoryPicker() {
  const setRepository = useSession((state) => state.openRepository);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  /*
   * Guards against a second panel.
   *
   * macOS takes a noticeable moment to bring up NSOpenPanel the first time,
   * and a second click during that gap stacks a second panel behind the first.
   * A ref rather than the phase state, because the guard has to hold within
   * the same tick as the click that sets it.
   */
  const inFlight = useRef(false);

  async function choose() {
    if (inFlight.current) return;
    inFlight.current = true;

    setError(null);
    setPhase("choosing");

    try {
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
      setRepository(await openRepository(selected));
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      // Runs on cancel too, so the button cannot be left disabled by someone
      // dismissing the panel.
      setPhase("idle");
      inFlight.current = false;
    }
  }

  const label =
    phase === "choosing"
      ? "Elige una carpeta…"
      : phase === "opening"
        ? "Abriendo…"
        : "Abrir repositorio";

  return (
    <div className="repository-picker">
      <button
        type="button"
        className="button button--primary"
        disabled={phase !== "idle"}
        aria-busy={phase !== "idle"}
        onClick={() => {
          void choose();
        }}
      >
        {phase !== "idle" && (
          <span className="button__spinner" aria-hidden="true" />
        )}
        {label}
      </button>
      {error !== null && (
        <p className="state state--error repository-picker__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
