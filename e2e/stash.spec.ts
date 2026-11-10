import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { browser, expect } from "@wdio/globals";
import { setOptions } from "expect-webdriverio";
import { e2eRepository } from "../wdio.conf";
import { waitForHistory } from "./history";
import { clickAndConfirm, setReactSelectValue } from "./interactions";

// The default assertion wait is 2 s, too short for a slow Windows runner loading 200 stashes.
// Every spec runs in its own worker, so this does not leak into the others.
setOptions({ wait: 20_000, interval: 250 });

const PANEL = ".stash-detail";
// Windows temp paths can use 8.3 aliases (RUNNER~1) while the app shows the canonical path,
// so worktrees are matched by their final folder name, which never differs.
const MAIN_WORKTREE = `.sidebar__worktree[title$="${path.basename(e2eRepository)}"]`;
const LINKED_WORKTREE = `.sidebar__worktree[title$="${path.basename(e2eRepository)}-linked"]`;
const CENTER = ".file-diff";

/** Scoped text selector supported by the native WebDriver bridge. */
function control(scope: string, label: string): string {
  return `//*[contains(concat(' ', normalize-space(@class), ' '), ' ${scope.slice(1)} ')]//button[normalize-space()="${label}"]`;
}

/** Git is used only against this run's owned synthetic fixture. */
function git(...args: string[]): string {
  return execFileSync("git", ["-C", e2eRepository, ...args], {
    encoding: "utf8",
  });
}

/** Repository state whose bytes must survive every read-only interaction. */
function snapshot(): string {
  return JSON.stringify({
    head: git("rev-parse", "HEAD"),
    refs: git("show-ref"),
    log: fs.readFileSync(
      path.join(e2eRepository, ".git/logs/refs/stash"),
      "utf8",
    ),
    index: fs
      .readFileSync(path.join(e2eRepository, ".git/index"))
      .toString("hex"),
    files: ["dual.txt", "cancel.txt", ".gitignore"].map((name) =>
      fs.readFileSync(path.join(e2eRepository, name), "utf8"),
    ),
  });
}

/** Selects a saved comparison, waiting for its immutable files to load. */
async function mode(label: string): Promise<void> {
  await (await browser.$(control(PANEL, label))).click();
  await browser.waitUntil(
    async () =>
      (await browser.$(`${PANEL} .stash-detail__count`).getText()).includes(
        "archivos",
      ),
    { timeout: 20_000 },
  );
}

/** Reads the pressed state in the page, avoiding driver differences for ARIA attributes. */
async function expectPressed(label: string): Promise<void> {
  const read = () =>
    browser.execute((text) => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".stash-detail .segmented__option",
        ),
      ].find((item) => item.textContent?.trim() === text);
      return {
        pressed: button?.getAttribute("aria-pressed") ?? null,
        modes: [
          ...document.querySelectorAll(".stash-detail .segmented__option"),
        ].map((item) => item.outerHTML),
      };
    }, label);
  try {
    await browser.waitUntil(async () => (await read()).pressed === "true", {
      timeout: 20_000,
    });
  } catch (error) {
    throw new Error(
      `${label} is not pressed: ${JSON.stringify(await read())}`,
      { cause: error },
    );
  }
}

/** Reads the inventory count in the page, avoiding driver differences when reading text. */
async function expectCount(expected: string): Promise<void> {
  const read = () =>
    browser.execute(
      () =>
        document
          .querySelector(".stash-section .sidebar__count")
          ?.textContent?.trim() ?? null,
    );
  try {
    await browser.waitUntil(async () => (await read()) === expected, {
      timeout: 20_000,
    });
  } catch (error) {
    throw new Error(
      `stash count is ${JSON.stringify(await read())}, expected ${expected}`,
      { cause: error },
    );
  }
}

/** Opens an exact saved row through the shared file browser. */
async function file(name: string): Promise<void> {
  const row = await browser.$(
    `//aside[contains(@class,"stash-detail")]//button[contains(@class,"file-row")][.//span[normalize-space()="${name}"]]`,
  );
  await row.waitForDisplayed({ timeout: 20_000 });
  await row.click();
  await browser.$(`${CENTER} .diff-viewer`).waitForExist({ timeout: 20_000 });
}

describe("read-only stash inspection", () => {
  let baseline = "";
  before(async () => {
    await waitForHistory(1);
    baseline = snapshot();
  });

  it("shows the stash on its visible base row and opens its inspector from the popover", async () => {
    await waitForHistory(1);
    const row = await browser.$(".commit-row");
    await row.waitForDisplayed({ timeout: 20_000 });
    await row.click();
    const selectedRowName = await browser
      .$(".commit-row--selected")
      .getAttribute("aria-label");
    if (selectedRowName === null) {
      throw new Error("The graph row did not retain its selection name");
    }
    const graphScrollTop = await browser
      .$(".commit-table")
      .getProperty("scrollTop");
    const trigger = await row.$(".stash-anchor");
    await trigger.waitForDisplayed({ timeout: 20_000 });
    await expect(trigger).toHaveText("1");
    await trigger.click();
    await expect(browser.$(".stash-anchor-popover")).toBeDisplayed();
    await expect(browser.$(".stash-anchor-popover")).toHaveText(
      expect.stringContaining("saved states with a deliberately long message"),
    );
    await (await browser.$(".stash-anchor-popover__entry")).click();
    await expect(browser.$(PANEL)).toBeDisplayed();
    await expect(browser.$(PANEL)).toHaveText(
      expect.stringContaining("saved states with a deliberately long message"),
    );
    await expect(browser.$(".stash-anchor--active")).toExist();
    await expect(browser.$(".commit-row--selected")).toHaveAttribute(
      "aria-label",
      selectedRowName,
    );
    expect(await browser.$(".commit-table").getProperty("scrollTop")).toBe(
      graphScrollTop,
    );
    await browser.keys(["Escape"]);
    await expect(browser.$(PANEL)).not.toExist();
    expect(snapshot()).toBe(baseline);
  });

  it("opens metadata over the graph and inspects all saved comparisons and whole versions", async () => {
    await (await browser.$("[data-stash-row]")).click();
    await expect(browser.$(PANEL)).toBeDisplayed();
    await expect(browser.$(".commit-table")).toBeDisplayed();
    await expect(browser.$(CENTER)).not.toExist();
    await expect(browser.$(PANEL)).toHaveText(
      expect.stringContaining("Solo lectura"),
    );
    await file("dual.txt");
    await expect(browser.$(CENTER)).toHaveText(
      expect.stringContaining("saved worktree"),
    );
    await (await browser.$(control(CENTER, "Versión anterior"))).click();
    await expect(browser.$(CENTER)).toHaveText(expect.stringContaining("base"));
    await (await browser.$(control(CENTER, "Versión guardada"))).click();
    await expect(browser.$(CENTER)).toHaveText(
      expect.stringContaining("saved worktree"),
    );
    await mode("Preparados");
    await file("dual.txt");
    await expect(browser.$(CENTER)).toHaveText(
      expect.stringContaining("prepared"),
    );
    await mode("Sin preparar");
    await file("dual.txt");
    await expect(browser.$(CENTER)).toHaveText(
      expect.stringContaining("saved worktree"),
    );
    await file("cancel.txt");
    await mode("Todos");
    await expect(browser.$(".app-shell__history")).toHaveText(
      expect.stringContaining("Selecciona un archivo de esta vista"),
    );
    await mode("No rastreados");
    await file("ignored.txt");
    await expect(browser.$(CENTER)).toHaveText(
      expect.stringContaining("saved ignored"),
    );
    await expect(browser.$(control(CENTER, "Versión anterior"))).toBeDisabled();
    await browser.keys(["Escape"]);
    await expect(browser.$(".commit-table")).toBeDisplayed();
    await expect(browser.$(PANEL)).toBeDisplayed();
    await browser.keys(["Escape"]);
    await expect(browser.$(PANEL)).not.toExist();
    await browser.waitUntil(
      async () =>
        await browser.execute(() =>
          document.activeElement?.hasAttribute("data-stash-row"),
        ),
      { timeout: 20_000 },
    );
    expect(snapshot()).toBe(baseline);
  });

  it("searches beyond the first page and keeps the inspected OID outside results", async () => {
    const input = await browser.$(".sidebar input[type=search]");
    await input.setValue("needle oldest");
    await expect(browser.$(".stash-section")).toHaveText(
      expect.stringContaining("needle oldest"),
    );
    await (await browser.$("[data-stash-row]")).click();
    await expect(browser.$(PANEL)).toHaveText(
      expect.stringContaining("saved states with a deliberately long message"),
    );
    await input.setValue("no stash matches this");
    await expect(browser.$(".stash-section")).toHaveText(
      expect.stringContaining("No hay stashes que coincidan"),
    );
    await expect(browser.$(".stash-anchor")).toHaveText("1");
    await expect(browser.$(PANEL)).toHaveText(
      expect.stringContaining("saved states with a deliberately long message"),
    );
    await input.setValue("");
    expect(snapshot()).toBe(baseline);
  });

  it("fits 940 by 600 in both themes and languages", async () => {
    await browser.setWindowSize(940, 600);
    for (const theme of ["light", "dark"] as const) {
      for (const language of ["es", "en"] as const) {
        await clickAndConfirm(".preferences-menu__toggle", async () => {
          await expect(browser.$(".preferences-menu__panel")).toBeDisplayed();
        });
        await setReactSelectValue(".theme-selector__select", theme);
        await setReactSelectValue(".language-selector__select", language);
        await (await browser.$(".preferences-menu__toggle")).click();
        await browser.$("[data-stash-row]").waitForExist({ timeout: 20_000 });
        const bounds = await browser.execute(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          innerWidth,
          innerHeight,
        }));
        expect(bounds.width).toBeLessThanOrEqual(bounds.innerWidth);
        expect(bounds.height).toBeLessThanOrEqual(bounds.innerHeight);
        await browser.saveScreenshot(
          path.join(
            os.tmpdir(),
            `gitcanvas-v07-stash-${theme}-${language}.png`,
          ),
        );
      }
    }
    // Return the fixture to the language used by the remaining interaction checks.
    await (await browser.$(".preferences-menu__toggle")).click();
    await setReactSelectValue(".language-selector__select", "es");
    await (await browser.$(".preferences-menu__toggle")).click();
  });

  it("shares inventory across worktrees while keeping each tab's inspection", async () => {
    await (await browser.$(LINKED_WORKTREE)).click();
    await expectCount("202");
    await expect(browser.$(PANEL)).not.toExist();
    await (await browser.$("[data-stash-row]")).click();
    await mode("Preparados");
    await (await browser.$(MAIN_WORKTREE)).click();
    await expectPressed("Todos");
    await (await browser.$(LINKED_WORKTREE)).click();
    await expectPressed("Preparados");
    // Change the common inventory from the linked worktree, then reactivate main.
    execFileSync(
      "git",
      ["-C", `${e2eRepository}-linked`, "stash", "drop", "stash@{201}"],
      { stdio: "pipe" },
    );
    await expectCount("201");
    await (await browser.$(MAIN_WORKTREE)).click();
    await expectCount("201");
    await expectPressed("Todos");
  });

  it("refreshes an old drop with unchanged tip and retains a removed selected stash", async () => {
    git("stash", "drop", "stash@{200}");
    await expectCount("200");
    // Every seeded row has the same OID; removing one alias must not mark it absent.
    await expect(browser.$(PANEL)).not.toHaveText(
      expect.stringContaining("Este stash se eliminó"),
    );
    git("stash", "clear");
    await expectCount("0");
    await expect(browser.$(PANEL)).toHaveText(
      expect.stringContaining("Este stash se eliminó"),
    );
    await mode("Todos");
    await file("dual.txt");
    await expect(browser.$(CENTER)).toHaveText(
      expect.stringContaining("saved worktree"),
    );
    await (await browser.$("[data-stash-back]")).click();
    fs.writeFileSync(
      path.join(e2eRepository, "dual.txt"),
      "external next stash\n",
    );
    git("stash", "push", "-m", "new external stash");
    await expectCount("1");
    await expect(browser.$(PANEL)).toHaveText(
      expect.stringContaining("Este stash se eliminó"),
    );
    await (await browser.$("[data-stash-close]")).click();
    await (await browser.$("[data-stash-row]")).click();
    await expect(browser.$(PANEL)).toHaveText(
      expect.stringContaining("new external stash"),
    );
  });
});
