import type { AppError } from "../bindings";

/**
 * How each backend failure is introduced to the user.
 *
 * The interface speaks Spanish; the backend's own messages are English
 * diagnostics for whoever reads a log or a bug report. Each is shown after a
 * Spanish summary of what kind of failure it was, so the screen reads in one
 * language and the precise cause is still there to copy.
 *
 * A `Record` over every kind: adding a variant to `AppError` in Rust fails the
 * type check here until it has a summary.
 */
const KIND_SUMMARY: Record<AppError["kind"], string> = {
  InvalidRepository: "No es un repositorio válido",
  Io: "Falló una operación de archivos",
  Git: "Git no pudo completar la operación",
  InvalidInput: "La solicitud no es válida",
  PathOutsideRepository: "La ruta queda fuera del repositorio",
  WorktreeChanged: "Los cambios locales se modificaron mientras se leían",
  WorktreeFileUnavailable: "El archivo local no está disponible",
  ResourceLimitExceeded: "Se superó un límite de recursos",
  WatchDegraded: "La observación del repositorio está degradada",
  StaleCursor: "El historial cambió mientras se leía",
  ResourceExhausted: "El sistema se quedó sin archivos abiertos",
  Internal: "Falló una operación interna",
};

function summaryFor(kind: string): string | undefined {
  return (KIND_SUMMARY as Partial<Record<string, string>>)[kind];
}

/**
 * Text to show the user for a failure of any origin.
 *
 * Backend errors carry a `kind` and get a Spanish summary; anything else keeps
 * its own message. Recognised by shape rather than by class so this module
 * does not depend on the IPC layer it describes.
 */
export function userMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const kind =
    "kind" in error && typeof error.kind === "string" ? error.kind : null;
  const summary = kind === null ? undefined : summaryFor(kind);
  return summary === undefined ? error.message : `${summary}: ${error.message}`;
}
