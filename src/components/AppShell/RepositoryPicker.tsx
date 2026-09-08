import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import { IpcError, openRepository } from "../../lib/ipc";
import { useSession } from "../../state/session";

/** Human wording for each failure the engine can report. */
function messageFor(error: unknown): string {
  if (error instanceof IpcError) {
    switch (error.kind) {
      case "InvalidRepository":
        return "Esa carpeta no es un repositorio Git.";
      case "Io":
        return "No se pudo acceder a esa ruta.";
      case "InvalidInput":
        return "La ruta indicada no es válida.";
      case "StaleCursor":
        return "El historial cambió mientras se leía. Volvé a abrir el repositorio.";
      case "Git":
      case "Internal":
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Opens a local repository through the native folder picker. */
export function RepositoryPicker() {
  const setRepository = useSession((state) => state.openRepository);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose() {
    setError(null);
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;

    setBusy(true);
    try {
      setRepository(await openRepository(selected));
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="repository-picker">
      <button
        type="button"
        className="button button--primary"
        disabled={busy}
        onClick={() => {
          void choose();
        }}
      >
        {busy ? "Abriendo…" : "Abrir repositorio"}
      </button>
      {error !== null && (
        <p className="repository-picker__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
