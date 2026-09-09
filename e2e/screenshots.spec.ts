import fs from "node:fs";

import { $, $$, browser, expect } from "@wdio/globals";

/** Where the captures land. */
const OUT = "/tmp/gc-shots";

describe("GitCanvas against its own history", () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await browser.setWindowSize(1440, 900);
    // A fixed pause is a coin flip on a loaded machine: cold-start time
    // varies with whatever else is running. Wait for the actual signal that
    // the history rendered instead of guessing how long that takes.
    await browser.waitUntil(
      async () => (await $$('[role="option"]').length) > 0,
      {
        timeout: 20_000,
        timeoutMsg: "the commit history never rendered",
      },
    );
  });

  it("captures the graph with branch badges and no selection", async () => {
    const rows = await $$('[role="option"]');
    await expect(rows).toBeElementsArrayOfSize({ gte: 10 });

    await browser.saveScreenshot(`${OUT}/01-graph.png`);
  });

  it("captures a search in progress", async () => {
    const search = await $('input[type="search"]');
    await search.setValue("keychain");
    await browser.pause(1200);

    await browser.saveScreenshot(`${OUT}/02-search.png`);

    await search.clearValue();
    await browser.pause(800);
  });

  it("captures a commit with its file list", async () => {
    const rows = await $$('[role="option"]');
    await rows[4].click();
    await browser.pause(2500);

    await browser.saveScreenshot(`${OUT}/03-files.png`);
  });

  it("captures a file diff filling the centre panel", async () => {
    const files = await $$('[aria-label="Archivos modificados"] button');
    for (const file of files) {
      const label = await file.getText();
      if (label.includes("binario") || label.includes("grande")) continue;
      await file.click();
      break;
    }
    await browser.pause(2500);

    await browser.saveScreenshot(`${OUT}/04-file-diff.png`);
  });

  it("captures the panels after being resized", async () => {
    const back = await $("button=← Volver al graph");
    if (await back.isExisting()) {
      await back.click();
      await browser.pause(1200);
    }

    // Widen the inspector from the keyboard, which is the accessible path and
    // also the one a test can drive deterministically.
    const dividers = await $$('[role="separator"]');
    await expect(dividers).toBeElementsArrayOfSize({ gte: 2 });

    await dividers[1].click();
    for (let press = 0; press < 8; press += 1) {
      await browser.keys("ArrowLeft");
    }
    await browser.pause(1500);

    await browser.saveScreenshot(`${OUT}/05-resized.png`);
  });
});
