import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import type { Workspace } from "../src/bindings";
import { e2eDataDir, e2eRepository, e2eRepositoryRoot } from "../wdio.conf";
import { waitForHistory } from "./history";
import { clickAndConfirm, setReactSelectValue } from "./interactions";

/** Real native UI, Rust store and Git fixture, isolated from the user's projects. */
describe("stable branch graph preferences", () => {
  it("chooses the main trajectory and color without changing the working branch", async () => {
    // The fixture starts with the host's locale, which differs on macOS and
    // Linux. This scenario uses Spanish labels, so make that precondition
    // explicit instead of depending on the runner's system language.
    await clickAndConfirm(
      ".preferences-menu__toggle",
      async () => await expect($(".preferences-menu__panel")).toBeDisplayed(),
    );
    await setReactSelectValue(".language-selector__select", "es");
    await clickAndConfirm(
      ".preferences-menu__toggle",
      async () =>
        await expect($(".preferences-menu__panel")).not.toBeDisplayed(),
    );
    await waitForHistory(3);
    await browser.setWindowSize(940, 600);
    await browser.executeAsync((done) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          done(null);
        });
      });
    });
    await clickAndConfirm(
      '[aria-label="Acciones de main"]',
      async () =>
        await expect(
          $('[role="menuitem"]*=Cambiar color de rama'),
        ).toBeDisplayed(),
    );
    await clickAndConfirm(
      '[role="menuitem"]*=Cambiar color de rama',
      async () => await expect($(".sidebar__palette")).toBeDisplayed(),
    );
    await clickAndConfirm(
      '//div[contains(@class,"sidebar__palette")]//button[normalize-space(.)="Azul"]',
      async () => await expect($(".sidebar__palette")).not.toExist(),
    );
    await browser.waitUntil(
      () => {
        const file = path.join(e2eDataDir, "workspace.json");
        if (!fs.existsSync(file)) return false;
        const stored = JSON.parse(fs.readFileSync(file, "utf8")) as {
          workspace: Workspace;
        };
        return stored.workspace.graph_preferences.some(
          (preference) =>
            preference.scope === "repository" &&
            preference.path === path.join(e2eRepositoryRoot, ".git") &&
            preference.colors.some(
              (color) =>
                color.reference === "refs/heads/main" &&
                color.color === "blue" &&
                color.edited > 0,
            ),
        );
      },
      { timeoutMsg: "the selected branch color was not persisted" },
    );
    await clickAndConfirm(
      '[aria-label="Acciones de main"]',
      async () =>
        await expect(
          $('[role="menuitem"]*=Usar como principal visual'),
        ).toBeDisplayed(),
    );
    await clickAndConfirm(
      '[role="menuitem"]*=Usar como principal visual',
      async () => {
        await browser.waitUntil(() =>
          browser.execute(() => {
            const node = document.querySelector(".graph-canvas__node");
            return (
              node?.getAttribute("cx") === "16" &&
              document
                .querySelector(".sidebar__item--head")
                ?.textContent?.includes("main") === true
            );
          }),
        );
      },
    );
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
    await clickAndConfirm(
      `[aria-label="Cerrar ${path.basename(e2eRepository)}"]`,
      async () => await expect($(".project-library")).toBeDisplayed(),
    );
    await clickAndConfirm(
      `.project-library__open[title$="${path.basename(e2eRepository)}"]`,
      async () => {
        await browser.waitUntil(async () =>
          browser.execute(
            () =>
              document.querySelector('[role="tab"][aria-selected="true"]') !==
              null,
          ),
        );
      },
    );
    await waitForHistory(3);
    await browser.waitUntil(
      async () => await $('[aria-label="Rama principal visual"]').isDisplayed(),
      {
        timeoutMsg: "the saved visual principal did not return after reopening",
      },
    );
    await expect($(".sidebar__item .branch-color")).toHaveStyle({
      "background-color": String(color.value),
    });
    await expect($('[aria-label="Rama principal visual"]')).toBeDisplayed();
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-v04-graph-reopened.png"),
    );
  });

  it("keeps keyboard controls usable in English and light theme at minimum size", async () => {
    await clickAndConfirm(
      ".preferences-menu__toggle",
      async () => await expect($(".preferences-menu__panel")).toBeDisplayed(),
    );
    await setReactSelectValue(".theme-selector__select", "light");
    await setReactSelectValue(".language-selector__select", "en");
    await clickAndConfirm(
      ".preferences-menu__toggle",
      async () =>
        await expect($(".preferences-menu__panel")).not.toBeDisplayed(),
    );
    await clickAndConfirm(
      '[aria-label="Actions for side"]',
      async () =>
        await expect(
          $('[role="menuitem"]*=Use as visual main branch'),
        ).toBeDisplayed(),
    );
    await clickAndConfirm(
      '[role="menuitem"]*=Use as visual main branch',
      async () =>
        await expect($('[aria-label="Visual main branch"]')).toBeDisplayed(),
    );
    await expect($(".sidebar__item--head")).toHaveText(
      expect.stringContaining("main"),
    );
    await expect($('[aria-label="Visual main branch"]')).toBeDisplayed();
    await clickAndConfirm(
      '[aria-label="Actions for side"]',
      async () =>
        await expect(
          $('[role="menuitem"]*=Change branch color'),
        ).toBeDisplayed(),
    );
    await clickAndConfirm(
      '[role="menuitem"]*=Change branch color',
      async () =>
        await expect(
          $('[role="group"][aria-label="Color for side"]'),
        ).toBeDisplayed(),
    );
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
