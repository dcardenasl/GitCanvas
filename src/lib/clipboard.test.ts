import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "./clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  it("reports success when the clipboard accepts the text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("abc")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
  });

  it("reports failure instead of throwing", async () => {
    // The clipboard API rejects in contexts the application cannot detect in
    // advance, and a rejected promise must not unwind a click handler.
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    await expect(copyText("abc")).resolves.toBe(false);
  });

  it("reports failure when there is no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyText("abc")).resolves.toBe(false);
  });
});
