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
  Auth: "Falló la autenticación",
  Network: "No se pudo completar la operación de red",
  Conflict: "La operación entra en conflicto con el estado actual",
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

const UNKNOWN_ERROR_MESSAGE = "Ocurrió un error inesperado.";

/** Whether a value is one of the backend's known, user-facing error kinds. */
export function isAppErrorKind(kind: unknown): kind is AppError["kind"] {
  return (
    typeof kind === "string" &&
    Object.prototype.hasOwnProperty.call(KIND_SUMMARY, kind)
  );
}

/** The backend error category of `error`, if it came from the backend. */
export function errorKind(error: unknown): AppError["kind"] | null {
  if (!(error instanceof Error) || !("kind" in error)) return null;
  return isAppErrorKind(error.kind) ? error.kind : null;
}

/** Safe Spanish summary for structured errors, including watcher events. */
export function appErrorMessage(kind: unknown, message: unknown): string {
  if (!isAppErrorKind(kind) || typeof message !== "string") {
    return UNKNOWN_ERROR_MESSAGE;
  }
  return `${KIND_SUMMARY[kind]}: ${message}`;
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
  if (!("kind" in error)) return error.message;
  return appErrorMessage(error.kind, error.message);
}
