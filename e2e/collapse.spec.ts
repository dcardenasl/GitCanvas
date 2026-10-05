import { $, $$, browser, expect } from "@wdio/globals";

import { waitForHistory } from "./history";

/** Verifies the collapsed-sidebar layout with real geometry, not just the DOM. */
describe("reading a file with the sidebar collapsed", () => {
  before(async () => {
    await browser.setWindowSize(1440, 900);
    await waitForHistory(5);
  });

  it("gives the file view the room the sidebar released", async () => {
    const rows = await $$('[role="option"]');
    const row = rows[4];
    if (row === undefined) throw new Error("Expected at least five commits");
    await row.click();

    const files = await $$('[aria-label="Archivos modificados"] button');
    await expect(files).toBeElementsArrayOfSize({ gte: 1 });
    const file = files[0];
    if (file === undefined) throw new Error("Expected a changed file");
    await file.click();
    await browser.waitUntil(
      async () => await browser.$(".file-diff").isDisplayed(),
      { timeout: 20_000, timeoutMsg: "the selected file diff never opened" },
    );

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
    // The bug this guards: the file view landed in the sidebar's zero-width
    // column and the inspector filled the window.
    expect(geometry.children).toBe(5);
    expect(geometry.sidebar).toBe(0);
    expect(geometry.fileView).toBeGreaterThan(400);
    expect(geometry.inspector).toBeLessThan(700);
  });

  it("brings the sidebar back when asked", async () => {
    await (await $("button=Ramas")).click();
    await browser.waitUntil(
      async () =>
        await browser.execute(() => {
          const el = document.querySelector(".sidebar");
          return el !== null && el.getBoundingClientRect().width > 100;
        }),
      { timeout: 20_000, timeoutMsg: "the pinned sidebar did not reopen" },
    );
    const sidebar = await browser.execute(() => {
      const el = document.querySelector(".sidebar");
      return el ? Math.round(el.getBoundingClientRect().width) : -1;
    });

    console.log(`PINNED sidebar=${String(sidebar)}`);
    expect(sidebar).toBeGreaterThan(100);
  });
});
