import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { browser, expect } from "@wdio/globals";

import { waitForHistory } from "./history";
import { e2eRepository } from "../wdio.conf";

/** Permanent regression coverage for the staged/unstaged working-tree view. */
describe("local changes", () => {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", e2eRepository, ...args], { stdio: "pipe" });

  before(async () => {
    await waitForHistory();

    fs.writeFileSync(path.join(e2eRepository, "a.txt"), "one\ntwo\nthree\n");
    fs.writeFileSync(path.join(e2eRepository, "untracked.txt"), "new\n");
    fs.writeFileSync(path.join(e2eRepository, "staged.txt"), "before\n");
    git("add", "staged.txt");
  });

  it("shows staged, unstaged and new project files", async () => {
    await browser.waitUntil(
      async () =>
        (await (await browser.$('[aria-label="Preparados"]')).isDisplayed()) &&
        (await (await browser.$('[aria-label="Sin preparar"]')).isDisplayed()),
      { timeout: 20_000, timeoutMsg: "local change groups never rendered" },
    );

    await expect(
      await browser.$('[aria-label="Preparados"] button'),
    ).toBeDisplayed();
    await expect(
      await browser.$('[aria-label="Sin preparar"] button'),
    ).toBeDisplayed();
    const localText = await browser
      .$('[aria-label="Cambios locales"]')
      .getText();
    expect(localText).toContain("staged.txt");
    expect(localText).toContain("untracked.txt");
  });

  it("reports when a staged file disappears from local changes", async () => {
    await (await browser.$('[aria-label="Preparados"] button')).click();
    await browser.waitUntil(
      async () => (await browser.$(".file-diff")).isDisplayed(),
      { timeout: 20_000, timeoutMsg: "the staged diff never opened" },
    );

    fs.writeFileSync(path.join(e2eRepository, "staged.txt"), "after\n");
    git("add", "staged.txt");
    // Still open, and showing the new content: an edit while reading a file
    // must refresh the view, not close it.
    await browser.waitUntil(
      async () => {
        const view = await browser.$(".file-diff");
        return (
          (await view.isDisplayed()) && (await view.getText()).includes("after")
        );
      },
      { timeout: 20_000, timeoutMsg: "the staged diff did not refresh" },
    );

    fs.rmSync(path.join(e2eRepository, "staged.txt"));
    git("add", "-u", "staged.txt");
    await browser.waitUntil(
      async () => {
        const alert = await browser.$(".file-diff [role=alert]");
        return (
          (await alert.isDisplayed()) &&
          (await alert.getText()).includes(
            "El archivo local no está disponible",
          )
        );
      },
      {
        timeout: 20_000,
        timeoutMsg: "the unavailable local file was not reported",
      },
    );
    await expect(await browser.$(".file-diff")).toBeDisplayed();
  });
});
