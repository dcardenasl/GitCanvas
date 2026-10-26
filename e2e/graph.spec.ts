import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import type { Workspace } from "../src/bindings";
import { e2eDataDir, e2eRepository, e2eRepositoryRoot } from "../wdio.conf";
import { waitForHistory } from "./history";

/** Real native UI, Rust store and Git fixture, isolated from the user's projects. */
describe("stable branch graph preferences", () => {
  it("chooses the main trajectory and color without changing the working branch", async () => {
    await waitForHistory(3);
    await browser.setWindowSize(940, 600);
    await browser.executeAsync((done) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          done(null);
        });
      });
    });
    await $('[aria-label="Acciones de main"]').click();
    await $('[role="menuitem"]*=Cambiar color de rama').click();
    await $(
      '//div[contains(@class,"sidebar__palette")]//button[normalize-space(.)="Azul"]',
    ).click();
    await $('[aria-label="Acciones de main"]').click();
    await $('[role="menuitem"]*=Usar como principal visual').click();
    await browser.waitUntil(async () =>
      browser.execute(() => {
        const node = document.querySelector(".graph-canvas__node");
        return node?.getAttribute("cx") === "16";
      }),
    );
    await expect($(".sidebar__item--head")).toHaveText(
      expect.stringContaining("main"),
    );
    await browser.waitUntil(() => {
      const file = path.join(e2eDataDir, "workspace.json");
      if (!fs.existsSync(file)) return false;
      const stored = JSON.parse(fs.readFileSync(file, "utf8")) as {
        version: number;
        workspace: Workspace;
      };
      return (
        stored.version === 3 &&
        stored.workspace.graph_preferences.some(
          (p) =>
            p.scope === "repository" &&
            p.path === path.join(e2eRepositoryRoot, ".git") &&
            p.principal === "refs/heads/main" &&
            p.colors.some(
              (c) => c.reference === "refs/heads/main" && c.edited > 0,
            ),
        )
      );
    });
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-v04-graph-dark.png"),
    );
  });

  it("retains the graph preferences after closing and reopening the project", async () => {
    const color = await $(".sidebar__item .branch-color").getCSSProperty(
      "background-color",
    );
    await $(`[aria-label="Cerrar ${path.basename(e2eRepository)}"]`).click();
    await $(
      `.project-library__open[title$="${path.basename(e2eRepository)}"]`,
    ).click();
    await waitForHistory(3);
    await expect($(".sidebar__item .branch-color")).toHaveStyle({
      "background-color": String(color.value),
    });
    await expect($('[aria-label="Rama principal visual"]')).toBeDisplayed();
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-v04-graph-reopened.png"),
    );
  });

  it("keeps keyboard controls usable in English and light theme at minimum size", async () => {
    await $(".preferences-menu__toggle").click();
    await browser.execute(() => {
      for (const [selector, value] of [
        [".theme-selector__select", "light"],
        [".language-selector__select", "en"],
      ]) {
        const select = document.querySelector<HTMLSelectElement>(
          selector ?? "",
        );
        if (select === null || value === undefined)
          throw new Error("Preference selector missing");
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await $(".preferences-menu__toggle").click();
    await $('[aria-label="Actions for side"]').click();
    await $('[role="menuitem"]*=Use as visual main branch').click();
    await expect($(".sidebar__item--head")).toHaveText(
      expect.stringContaining("main"),
    );
    await expect($('[aria-label="Visual main branch"]')).toBeDisplayed();
    await $('[aria-label="Actions for side"]').click();
    await $('[role="menuitem"]*=Change branch color').click();
    await expect(
      $('[role="group"][aria-label="Color for side"]'),
    ).toBeDisplayed();
    const state = await browser.execute(() => ({
      title: document.title,
      theme: document.documentElement.dataset.theme,
      language: document.documentElement.lang,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      overlay: document.querySelector("vite-error-overlay") !== null,
    }));
    expect(state.title).toBe(`${path.basename(e2eRepository)} — GitCanvas`);
    expect(state.theme).toBe("light");
    expect(state.language).toBe("en");
    expect(state.overflow).toBe(false);
    expect(state.overlay).toBe(false);
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-v04-palette-light-en.png"),
    );
    await browser.keys("Escape");
    await expect($(".sidebar__palette")).not.toExist();
  });
});
