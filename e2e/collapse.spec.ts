import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { $, $$, browser, expect } from "@wdio/globals";

const SCREENSHOT_DIR = path.join(os.tmpdir(), "gc-shots");

/** Verifies the collapsed-sidebar layout with real geometry, not just the DOM. */
describe("reading a file with the sidebar collapsed", () => {
  before(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
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

  it("gives the file view the room the sidebar released", async () => {
    const rows = await $$('[role="option"]');
    const row = rows[4];
    if (row === undefined) throw new Error("Expected at least five commits");
    await row.click();
    await browser.pause(2000);

    const files = await $$('[aria-label="Archivos modificados"] button');
    await expect(files).toBeElementsArrayOfSize({ gte: 1 });
    const file = files[0];
    if (file === undefined) throw new Error("Expected a changed file");
    await file.click();
    await browser.pause(2500);

    /*
     * No nested functions inside `browser.execute`: esbuild injects its
     * `__name` helper into them, and the browser has no such variable. Every
     * measurement is therefore written out longhand.
     */
    const geometry = await browser.execute(() => {
      const body = document.querySelector(".app-shell__body");
      const sidebar = document.querySelector(".sidebar");
      const centre = document.querySelector(".app-shell__history");
      const fileView = document.querySelector(".file-diff");
      const inspector = document.querySelector(".detail-panel");
      return {
        columns: body ? getComputedStyle(body).gridTemplateColumns : "absent",
        children: body ? body.children.length : 0,
        sidebar: sidebar
          ? Math.round(sidebar.getBoundingClientRect().width)
          : -1,
        centre: centre ? Math.round(centre.getBoundingClientRect().width) : -1,
        fileView: fileView
          ? Math.round(fileView.getBoundingClientRect().width)
          : -1,
        inspector: inspector
          ? Math.round(inspector.getBoundingClientRect().width)
          : -1,
      };
    });

    console.log(`COLLAPSE ${JSON.stringify(geometry)}`);
    await browser.saveScreenshot(path.join(SCREENSHOT_DIR, "06-file-open.png"));

    // The bug this guards: the file view landed in the sidebar's zero-width
    // column and the inspector filled the window.
    expect(geometry.children).toBe(5);
    expect(geometry.sidebar).toBe(0);
    expect(geometry.fileView).toBeGreaterThan(400);
    expect(geometry.inspector).toBeLessThan(700);
  });

  it("brings the sidebar back when asked", async () => {
    await (await $("button=Ramas")).click();
    await browser.pause(1500);

    const sidebar = await browser.execute(() => {
      const el = document.querySelector(".sidebar");
      return el ? Math.round(el.getBoundingClientRect().width) : -1;
    });

    console.log(`PINNED sidebar=${String(sidebar)}`);
    expect(sidebar).toBeGreaterThan(100);

    await browser.saveScreenshot(
      path.join(SCREENSHOT_DIR, "07-sidebar-pinned.png"),
    );
  });
});
