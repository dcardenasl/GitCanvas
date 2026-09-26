import { describe, expect, it } from "vitest";

import { IpcError } from "./ipc";
import { userMessage } from "./errors";

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

  it("leaves other errors and values as they are", () => {
    expect(userMessage(new Error("boom"))).toBe("boom");
    expect(userMessage("plain")).toBe("plain");
  });

  it("does not invent a summary for a kind it does not know", () => {
    const error = Object.assign(new Error("detail"), { kind: "FromTheFuture" });
    expect(userMessage(error)).toBe("detail");
  });
});
