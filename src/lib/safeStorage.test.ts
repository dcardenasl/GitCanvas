// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { safeStorage } from "./safeStorage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeStorage", () => {
  it("reads and writes values when browser storage is available", () => {
    const key = "gitcanvas.safe-storage-test";

    expect(safeStorage.set(key, "value")).toBe(true);
    expect(safeStorage.get(key)).toBe("value");

    localStorage.removeItem(key);
  });

  it("returns a fallback when storage access is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });

    expect(safeStorage.get("key")).toBeNull();
    expect(safeStorage.set("key", "value")).toBe(false);
  });
});
