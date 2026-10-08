import os from "node:os";
import path from "node:path";

import { $$, browser, expect } from "@wdio/globals";

import { waitForHistory } from "./history";

/** Exercises the native IPC and the complete commit-tree browsing flow. */
describe("commit tree browsing", () => {
  before(async () => {
    await waitForHistory();
    const commits = await $$('[role="option"]');
    await commits[0]?.click();
    await browser.waitUntil(
      async () =>
        await browser.$('[aria-label="Detalle del commit"]').isDisplayed(),
      {
        timeout: 20_000,
        timeoutMsg: "the selected commit detail never rendered",
      },
    );
  });

  it("shows unchanged files and opens their content from the commit tree", async () => {
    const checkbox = await browser.$('input[type="checkbox"]');
    await checkbox.click();

    await browser.waitUntil(
      async () =>
        await browser
          .$('ul[aria-label="Todos los archivos del commit"]')
          .isDisplayed(),
      { timeout: 20_000, timeoutMsg: "the commit tree never rendered" },
    );

    await browser.waitUntil(
      async () => {
        const rows = await $$(
          '[aria-label="Todos los archivos del commit"] .file-row',
        );
        for (const row of rows) {
          if ((await row.getText()).includes("filler.txt")) return true;
        }
        return false;
      },
      {
        timeout: 20_000,
        timeoutMsg: "the unchanged fixture file was not listed",
      },
    );
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-commit-tree.png"),
    );
    const target = await browser.$(
      '//ul[@aria-label="Todos los archivos del commit"]//button[contains(., "filler.txt")]',
    );
    await target.click();
    await browser.waitUntil(
      async () =>
        (await browser.$(".file-diff").getAttribute("aria-label")) ===
        "Archivo en filler.txt",
      {
        timeout: 20_000,
        timeoutMsg: "the unchanged file snapshot never opened",
      },
    );
    await expect(await browser.$(".file-diff__body")).toHaveText(
      expect.stringContaining("8"),
    );
  });
});
