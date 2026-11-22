import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { browser, expect } from "@wdio/globals";

import { waitForHistory } from "./history";
import { e2eRepository } from "../wdio.conf";
import { clickAndConfirm, setReactSelectValue } from "./interactions";

/** Permanent regression coverage for the staged/unstaged working-tree view. */
describe("local changes", () => {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", e2eRepository, ...args], { stdio: "pipe" });

  before(async () => {
    await waitForHistory();

    // This spec asserts translated labels in Spanish; pin its locale rather
    // than relying on whichever language the host or prior test selected.
    await clickAndConfirm(
      ".preferences-menu__toggle",
      async () =>
        await expect(browser.$(".preferences-menu__panel")).toBeDisplayed(),
    );
    await setReactSelectValue(".language-selector__select", "es");
    await clickAndConfirm(
      ".preferences-menu__toggle",
      async () =>
        await expect(browser.$(".preferences-menu__panel")).not.toBeDisplayed(),
    );

    // WDIO seeds the staged/unstaged/untracked files before the app opens.
    // Wait for the initial query to render them; the later edit test exercises
    // live refresh against a real post-startup filesystem change.
    await browser.waitUntil(
      async () =>
        browser.execute(() => {
          const panel = document.querySelector(
            '[aria-label="Cambios locales"]',
          );
          const staged = panel?.querySelector('[aria-label="Preparados"]');
          const unstaged = panel?.querySelector('[aria-label="Sin preparar"]');
          const panelText = panel?.textContent ?? "";
          return (
            staged != null &&
            unstaged != null &&
            panelText.includes("staged.txt") &&
            panelText.includes("untracked.txt") &&
            panelText.includes("highlight.ts")
          );
        }),
      {
        timeout: 20_000,
        timeoutMsg: "the staged and unstaged fixture files never appeared",
      },
    );
    await browser.execute(() => {
      const panel = document.querySelector<HTMLElement>(
        '[aria-label="Cambios locales"]',
      );
      const staged = panel?.querySelector<HTMLElement>(
        '[aria-label="Preparados"]',
      );
      if (panel === null || staged == null) return;
      panel.scrollTop +=
        staged.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    });
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

  it("colors the code of a supported file from the highlighting worker", async () => {
    await (
      await browser.$(
        '//*[@aria-label="Sin preparar"]//button[contains(., "highlight.ts")]',
      )
    ).click();

    // Tokens exist only if the bundled worker started and answered under the
    // production CSP; a worker that fails to load leaves the file as plain text.
    await browser.waitUntil(
      async () =>
        (await browser.$$(".file-diff .syntax-token--keyword").length) > 0,
      {
        timeout: 20_000,
        timeoutMsg: "the highlighting worker never colored the file",
      },
    );
  });

  it("reports when a staged file disappears from local changes", async () => {
    await (await browser.$('[aria-label="Preparados"] button')).click();
    await browser.waitUntil(
      async () => (await browser.$(".file-diff")).isDisplayed(),
      { timeout: 20_000, timeoutMsg: "the staged diff never opened" },
    );

    fs.writeFileSync(path.join(e2eRepository, "staged.txt"), "after\n");
    git("add", "staged.txt");
    expect(
      fs.readFileSync(path.join(e2eRepository, "staged.txt"), "utf8"),
    ).toBe("after\n");
    expect(git("show", ":staged.txt").toString()).toBe("after\n");
    // Still open, and showing the new content: an edit while reading a file
    // must refresh the view, not close it.
    try {
      await browser.waitUntil(
        async () =>
          browser.execute(() => {
            const view = document.querySelector(".file-diff");
            return (
              view !== null &&
              view.getBoundingClientRect().height > 0 &&
              (view.textContent ?? "").includes("after")
            );
          }),
        {
          timeout: 65_000,
          timeoutMsg:
            "the staged diff did not refresh within the worktree poll window",
        },
      );
    } catch (error) {
      const state = await browser.execute(() => ({
        diff: document.querySelector(".file-diff")?.textContent,
        alerts: Array.from(
          document.querySelectorAll<HTMLElement>("[role=alert]"),
        ).map((node) => node.textContent),
        runtimeErrors: (window as Window & { __gitcanvasE2EErrors?: string[] })
          .__gitcanvasE2EErrors,
      }));
      throw new Error(
        `${String(error)}; staged diff state: ${JSON.stringify(state)}`,
        {
          cause: error,
        },
      );
    }
    fs.rmSync(path.join(e2eRepository, "staged.txt"));
    git("add", "-u", "staged.txt");
    await browser.waitUntil(
      async () =>
        browser.execute(() => {
          const alert = document.querySelector(".file-diff [role=alert]");
          return (
            alert !== null &&
            alert.getBoundingClientRect().height > 0 &&
            (alert.textContent ?? "").includes(
              "El archivo local no está disponible",
            )
          );
        }),
      {
        timeout: 20_000,
        timeoutMsg: "the unavailable local file was not reported",
      },
    );
    await expect(await browser.$(".file-diff")).toBeDisplayed();
  });
});
