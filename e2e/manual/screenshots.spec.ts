import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { $, $$, browser, expect } from "@wdio/globals";

import { waitForHistory } from "../history";

/** Where the captures land. */
const OUT = path.join(os.tmpdir(), "gc-shots");

describe("GitCanvas against its own history", () => {
  before(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await browser.setWindowSize(1440, 900);
    await waitForHistory(10);
  });

  it("captures the graph with branch badges and no selection", async () => {
    const rows = await $$('[role="option"]');
    await expect(rows).toBeElementsArrayOfSize({ gte: 10 });

    await browser.saveScreenshot(`${OUT}/01-graph.png`);
  });

  it("captures a search in progress", async () => {
    const search = await $('input[type="search"]');
    await search.setValue("keychain");
    await browser.waitUntil(
      async () =>
        (await $('[role="status"]').getText()) === "sin coincidencias",
      {
        timeout: 20_000,
        timeoutMsg: "the search did not finish updating its status",
      },
    );

    await browser.saveScreenshot(`${OUT}/02-search.png`);

    await search.clearValue();
    await browser.waitUntil(
      async () => !(await $('[role="status"]').isExisting()),
      { timeout: 20_000, timeoutMsg: "the cleared search status remained" },
    );
  });

  it("captures a commit with its file list", async () => {
    const rows = await $$('[role="option"]');
    const row = rows[4];
    if (row === undefined) throw new Error("Expected at least five commits");
    await row.click();
    await browser.waitUntil(
      async () =>
        await browser.$('[aria-label="Detalle del commit"]').isDisplayed(),
      {
        timeout: 20_000,
        timeoutMsg: "the selected commit detail never opened",
      },
    );

    await browser.saveScreenshot(`${OUT}/03-files.png`);
  });

  it("captures a file diff filling the centre panel", async () => {
    const files = await $$('[aria-label="Archivos modificados"] button');
    let openedFile = false;
    for (const file of files) {
      const label = await file.getText();
      if (label.includes("binario") || label.includes("grande")) continue;
      await file.click();
      openedFile = true;
      break;
    }
    if (!openedFile) throw new Error("Expected a displayable changed file");
    await browser.waitUntil(
      async () => await browser.$(".file-diff").isDisplayed(),
      { timeout: 20_000, timeoutMsg: "the changed file diff never opened" },
    );

    await browser.saveScreenshot(`${OUT}/04-file-diff.png`);
  });

  it("captures the panels after being resized", async () => {
    const back = await $("button=← Volver al graph");
    if (await back.isExisting()) {
      await back.click();
      await browser.waitUntil(
        async () => !(await browser.$(".file-diff").isDisplayed()),
        { timeout: 20_000, timeoutMsg: "the graph view did not return" },
      );
    }

    // Widen the inspector from the keyboard, which is the accessible path and
    // also the one a test can drive deterministically.
    const dividers = await $$('[role="separator"]');
    await expect(dividers).toBeElementsArrayOfSize({ gte: 2 });

    const inspectorDivider = dividers[1];
    if (inspectorDivider === undefined) {
      throw new Error("Expected the inspector resize divider");
    }
    const initialWidth = await browser.execute(() => {
      const panel = document.querySelector(".detail-panel");
      return panel ? panel.getBoundingClientRect().width : 0;
    });
    await inspectorDivider.click();
    for (let press = 0; press < 8; press += 1) {
      await browser.keys("ArrowLeft");
    }
    await browser.waitUntil(
      async () =>
        await browser.execute(() => {
          const panel = document.querySelector(".detail-panel");
          return panel !== null && panel.getBoundingClientRect().width > 0;
        }),
      { timeout: 20_000, timeoutMsg: "the inspector did not remain visible" },
    );
    const resizedWidth = await browser.execute(() => {
      const panel = document.querySelector(".detail-panel");
      return panel ? panel.getBoundingClientRect().width : 0;
    });
    expect(resizedWidth).toBeGreaterThan(initialWidth);

    await browser.saveScreenshot(`${OUT}/05-resized.png`);
  });
});
