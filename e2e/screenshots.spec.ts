import fs from "node:fs";

import { $, $$, browser, expect } from "@wdio/globals";

/** Where the captures land. */
const OUT = "/tmp/gc-shots";

describe("GitCanvas against its own history", () => {
  before(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  it("captures the graph", async () => {
    await browser.setWindowSize(1280, 800);
    await browser.pause(3000);

    const rows = await $$('[role="option"]');
    await expect(rows).toBeElementsArrayOfSize({ gte: 10 });

    await browser.saveScreenshot(`${OUT}/01-graph.png`);
  });

  it("captures a commit with its diff", async () => {
    const rows = await $$('[role="option"]');
    // A commit with real file changes rather than the tip.
    await rows[3].click();
    await browser.pause(2500);

    const panel = await $('[aria-label="Detalle del commit"]');
    await expect(panel).toBeDisplayed();

    await browser.saveScreenshot(`${OUT}/02-diff.png`);
  });

  it("captures a merge commit, showing the first-parent notice", async () => {
    const rows = await $$('[role="option"]');
    let captured = false;

    for (const row of rows.slice(0, 40)) {
      const text = await row.getText();
      if (!text.includes("Merge")) continue;
      await row.click();
      await browser.pause(2500);
      await browser.saveScreenshot(`${OUT}/03-merge.png`);
      captured = true;
      break;
    }

    // The repository may legitimately have no merge in the loaded page.
    console.log(`MERGE_CAPTURED=${String(captured)}`);
  });

  it("captures the GitHub panel", async () => {
    const github = await $("button=GitHub");
    await github.click();
    await browser.pause(1500);
    await browser.saveScreenshot(`${OUT}/04-github.png`);
  });
});
