import os from "node:os";
import path from "node:path";

import { browser, expect } from "@wdio/globals";

import { clickAndConfirm, setReactSelectValue } from "./interactions";
import { waitForHistory } from "./history";

const VIEW = '//section[contains(@class, "file-history")]';
const DETAIL = '[aria-label="Detalle del commit"]';

/** The graph row whose summary contains `summary`. Rows are announced as options. */
function commitRow(summary: string) {
  return browser.$(`//*[@role="option"][contains(., "${summary}")]`);
}

/**
 * Selects a commit and opens its file's history from the detail panel. A file
 * history replaces the graph, so an open one is closed first to reach the rows.
 */
async function openFileHistory(summary: string, file: string): Promise<void> {
  if (await browser.$(VIEW).isExisting()) {
    await (
      await browser.$('//button[normalize-space()="Volver al gráfico"]')
    ).click();
    await browser.$(VIEW).waitForExist({ reverse: true, timeout: 20_000 });
  }
  await (await commitRow(summary)).click();
  const action = await browser.$(
    `//*[@aria-label="Detalle del commit"]//button[@aria-label="Historial de ${file}"]`,
  );
  await action.waitForDisplayed({
    timeout: 20_000,
    timeoutMsg: `the history action for ${file} never appeared`,
  });
  await action.click();
  await browser
    .$(`${VIEW}[@aria-label="Historial de ${file}"]`)
    .waitForDisplayed({
      timeout: 20_000,
      timeoutMsg: `the history of ${file} never opened`,
    });
}

/** The history rows as their visible text, in the order the engine returned them. */
async function historyRows(): Promise<string[]> {
  const rows = await browser.$$(
    `${VIEW}//ul[contains(@class, "file-history__rows")]/li`,
  );
  const texts: string[] = [];
  for (const row of rows) texts.push(await row.getText());
  return texts;
}

/** Exercises the per-file history on a fixture with each history shape. */
describe("file history", () => {
  before(async () => {
    await waitForHistory(4);
  });

  it("lists a deleted file's commits, including its merge and its earlier modification", async () => {
    await openFileHistory("delete notes.txt", "notes.txt");

    const rows = (await historyRows()).join("\n");
    expect(rows).toContain("delete notes.txt");
    expect(rows).toContain("resolve notes conflict");
    expect(rows).toContain("main change to notes");
    expect(rows).toContain("Fusión: comparada con su primer padre");
  });

  it("follows a rename and names the previous path of the row it came from", async () => {
    await openFileHistory("rename old.txt to renamed.txt", "renamed.txt");

    const rows = (await historyRows()).join("\n");
    expect(rows).toContain("Renombrado desde old.txt");
    expect(rows).toContain("base commit");
  });

  it("moves focus between rows with the keyboard", async () => {
    await openFileHistory("delete notes.txt", "notes.txt");

    const first = await browser.$(
      `${VIEW}//button[contains(., "delete notes.txt")]`,
    );
    await first.click();
    await browser.keys(["ArrowDown"]);
    const focused = await browser.execute(
      (): string => document.activeElement?.textContent ?? "",
    );
    expect(focused).toContain("resolve notes conflict");
  });

  it("shows a picked commit's change and jumps to it in the graph", async () => {
    await openFileHistory("delete notes.txt", "notes.txt");

    await (
      await browser.$(`${VIEW}//button[contains(., "resolve notes conflict")]`)
    ).click();
    await (
      await browser.$('//button[normalize-space()="Mostrar en el gráfico"]')
    ).click();

    await browser.waitUntil(async () => !(await browser.$(VIEW).isExisting()), {
      timeout: 20_000,
      timeoutMsg: "the file history never closed",
    });
    expect(await (await browser.$(DETAIL)).getText()).toContain(
      "resolve notes conflict",
    );
  });

  it("keeps the file history inside a 940 by 600 window in light and dark themes", async () => {
    await browser.setWindowSize(940, 600);
    for (const theme of ["light", "dark"] as const) {
      await clickAndConfirm(
        ".preferences-menu__toggle",
        async () => await expect($(".preferences-menu__panel")).toBeDisplayed(),
      );
      await setReactSelectValue(".theme-selector__select", theme);
      await clickAndConfirm(
        ".preferences-menu__toggle",
        async () =>
          await expect($(".preferences-menu__panel")).not.toBeDisplayed(),
      );
      await openFileHistory("delete notes.txt", "notes.txt");

      const fits = await browser.execute(() => {
        const view = document.querySelector<HTMLElement>(".file-history");
        return view !== null && view.scrollWidth <= view.clientWidth;
      });
      expect(fits).toBe(true);
      await browser.saveScreenshot(
        path.join(os.tmpdir(), `gitcanvas-file-history-${theme}.png`),
      );
      await (
        await browser.$('//button[normalize-space()="Volver al gráfico"]')
      ).click();
    }
  });
});
