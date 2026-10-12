import { afterEach, describe, expect, it } from "vitest";

import { changeLanguage } from "../i18n";

import { IpcError } from "./ipc";
import { describeError, errorKind, isAppErrorKind } from "./errors";

afterEach(async () => {
  await changeLanguage("es");
});

describe("describeError", () => {
  it("summarizes a backend failure and keeps the diagnostic apart", () => {
    const error = new IpcError({
      kind: "InvalidRepository",
      message: "Choose a working-tree root containing .git",
    });
    expect(describeError(error)).toEqual({
      summary: "No es un repositorio válido",
      detail: "Choose a working-tree root containing .git",
    });
  });

  it.each([
    ["Auth", "Falló la autenticación"],
    ["Network", "No se pudo completar la operación de red"],
    ["Conflict", "La operación entra en conflicto con el estado actual"],
  ] as const)("summarizes %s failures", (kind, summary) => {
    const error = new IpcError({ kind, message: "diagnostic" });
    expect(describeError(error)).toEqual({ summary, detail: "diagnostic" });
  });

  it("follows the active language without touching the diagnostic", async () => {
    await changeLanguage("en");
    const error = new IpcError({ kind: "Network", message: "timed out" });
    expect(describeError(error)).toEqual({
      summary: "The network operation could not be completed",
      detail: "timed out",
    });
  });

  it("describes a structured error that is not an Error instance", () => {
    expect(
      describeError({ kind: "WatchDegraded", message: "watch failed" }),
    ).toEqual({
      summary: "La observación del repositorio está degradada",
      detail: "watch failed",
    });
  });

  it("offers no detail when the backend sent an empty message", () => {
    const error = new IpcError({ kind: "Io", message: "" });
    expect(describeError(error).detail).toBeNull();
  });

  it("shows an error the code raised for itself as it is", () => {
    expect(describeError(new Error("boom"))).toEqual({
      summary: "boom",
      detail: null,
    });
  });

  it("does not print an arbitrary thrown value", () => {
    expect(describeError("plain").summary).toBe("Ocurrió un error inesperado.");
    expect(describeError(undefined).detail).toBeNull();
  });

  it("uses a safe fallback for an unknown structured error kind", () => {
    const error = Object.assign(new Error("detail"), { kind: "FromTheFuture" });
    expect(describeError(error)).toEqual({
      summary: "Ocurrió un error inesperado.",
      detail: null,
    });
  });
});

describe("isAppErrorKind", () => {
  it("recognizes only declared backend kinds", () => {
    expect(isAppErrorKind("WatchDegraded")).toBe(true);
    expect(isAppErrorKind("FromTheFuture")).toBe(false);
    expect(isAppErrorKind(null)).toBe(false);
  });
});

describe("errorKind", () => {
  it("reads the kind of a backend error and nothing else", () => {
    expect(errorKind(new IpcError({ kind: "Git", message: "x" }))).toBe("Git");
    expect(errorKind(new Error("x"))).toBeNull();
    expect(errorKind({ kind: "Git" })).toBeNull();
  });
});
