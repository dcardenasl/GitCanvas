import fs from "node:fs";

import { $, $$, browser, expect } from "@wdio/globals";

/** Where the captures land. */
const OUT = "/tmp/gc-shots";

describe("GitCanvas against its own history", () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await browser.setWindowSize(1440, 900);
    await browser.pause(3000);
  });

  it("captures the graph", async () => {
    const rows = await $$('[role="option"]');
    await expect(rows).toBeElementsArrayOfSize({ gte: 10 });

    await browser.saveScreenshot(`${OUT}/01-graph.png`);
  });

  it("captures the file list for a commit", async () => {
    const rows = await $$('[role="option"]');
    await rows[3].click();
    await browser.pause(2500);

    const files = await $('[aria-label="Archivos modificados"]');
    await expect(files).toBeDisplayed();

    await browser.saveScreenshot(`${OUT}/02-files.png`);
  });

  it("captures a file diff filling the centre panel", async () => {
    const files = await $$('[aria-label="Archivos modificados"] button');
    await expect(files).toBeElementsArrayOfSize({ gte: 1 });

    // The first file with actual hunks, so the capture shows a real patch.
    for (const file of files) {
      const label = await file.getText();
      if (label.includes("binario") || label.includes("grande")) continue;
      await file.click();
      break;
    }
    await browser.pause(2500);

    await browser.saveScreenshot(`${OUT}/03-file-diff.png`);
  });

  it("captures navigating to a branch tip from the sidebar", async () => {
    // The initial commit touches a file with a very long name, which is what
    // makes this capture worth taking: the list has to truncate rather than run
    // its stats off the panel.
    const back = await $("button=← Volver al graph");
    if (await back.isExisting()) {
      await back.click();
      await browser.pause(1200);
    }

    // WebdriverIO's partial-text selector cannot be combined with a CSS
    // prefix, so the sidebar is scoped first and searched within.
    const sidebar = await $('aside[aria-label="Ramas y etiquetas"]');
    const main = await sidebar.$("button*=main");
    await main.click();
    await browser.pause(2500);

    await browser.saveScreenshot(`${OUT}/04-branch-jump.png`);
  });
});
