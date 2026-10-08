import { describe, expect, it } from "vitest";

import { IpcError } from "./ipc";
import { appErrorMessage, isAppErrorKind, userMessage } from "./errors";

describe("userMessage", () => {
  it("introduces a backend failure in Spanish and keeps the diagnostic", () => {
    const error = new IpcError({
      kind: "InvalidRepository",
      message: "Choose a working-tree root containing .git",
    });
    expect(userMessage(error)).toBe(
      "No es un repositorio válido: Choose a working-tree root containing .git",
    );
  });

  it.each([
    ["Auth", "Falló la autenticación"],
    ["Network", "No se pudo completar la operación de red"],
    ["Conflict", "La operación entra en conflicto con el estado actual"],
  ] as const)("summarizes %s failures", (kind, summary) => {
    const error = new IpcError({ kind, message: "diagnostic" });
    expect(userMessage(error)).toBe(`${summary}: diagnostic`);
  });

  it("leaves other errors and values as they are", () => {
    expect(userMessage(new Error("boom"))).toBe("boom");
    expect(userMessage("plain")).toBe("plain");
  });

  it("uses a safe fallback for an unknown structured error kind", () => {
    const error = Object.assign(new Error("detail"), { kind: "FromTheFuture" });
    expect(userMessage(error)).toBe("Ocurrió un error inesperado.");
  });
});

describe("isAppErrorKind", () => {
  it("recognizes only declared backend kinds", () => {
    expect(isAppErrorKind("WatchDegraded")).toBe(true);
    expect(isAppErrorKind("FromTheFuture")).toBe(false);
    expect(isAppErrorKind(null)).toBe(false);
  });

  it("returns a safe summary for unknown structured errors", () => {
    expect(appErrorMessage("FromTheFuture", "internal detail")).toBe(
      "Ocurrió un error inesperado.",
    );
  });
});
