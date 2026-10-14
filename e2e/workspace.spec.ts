import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { e2eRepository, e2eSecondRepository, e2eDataDir } from "../wdio.conf";
import { waitForHistory } from "./history";

const alpha = path.basename(e2eRepository);
if (e2eSecondRepository === null)
  throw new Error("Workspace spec requires its two owned fixtures");
const beta = path.basename(e2eSecondRepository);

async function openList(kind: "Favoritos" | "Proyectos recientes") {
  await $('[aria-label="Abrir un proyecto"]').click();
  await $(`[role="menuitem"]=${kind}`).click();
}

async function expectProject(
  summary: string,
  localFile: string,
  otherFile: string,
) {
  await waitForHistory();
  await expect($('[role="option"]')).toHaveText(
    expect.stringContaining(summary),
  );
  const panel = await $('[aria-label="Cambios locales"]');
  await expect(panel).toHaveText(expect.stringContaining(localFile));
  await expect(panel).not.toHaveText(expect.stringContaining(otherFile));
}

describe("workspace projects", () => {
  it("restores the first tab, opens a second and isolates history and local changes while switching", async () => {
    await expectProject(
      "workspace alpha commit",
      "alpha-local.txt",
      "beta-local.txt",
    );
    await expect($$('[role="tab"]')).toBeElementsArrayOfSize(1);
    await openList("Proyectos recientes");
    await $(`.project-library__open[title$="${beta}"]`).click();
    await expectProject(
      "workspace beta commit",
      "beta-local.txt",
      "alpha-local.txt",
    );
    await expect($$('[role="tab"]')).toBeElementsArrayOfSize(2);
    await $(`[role="tab"][title$="${alpha}"]`).click();
    await expectProject(
      "workspace alpha commit",
      "alpha-local.txt",
      "beta-local.txt",
    );
    await $(`[role="tab"][title$="${beta}"]`).click();
    await expectProject(
      "workspace beta commit",
      "beta-local.txt",
      "alpha-local.txt",
    );
  });

  it("reopening reuses a tab, and a favorite survives closing and opens through the start screen", async () => {
    await openList("Proyectos recientes");
    await $(`.project-library__open[title$="${alpha}"]`).click();
    await expectProject(
      "workspace alpha commit",
      "alpha-local.txt",
      "beta-local.txt",
    );
    await expect($$('[role="tab"]')).toBeElementsArrayOfSize(2);
    await $(`[aria-label="Agregar ${alpha} a favoritos"]`).click();
    await browser.setWindowSize(940, 600);
    await browser.waitUntil(
      async () =>
        browser.execute(() => {
          const history = document.querySelector(".app-shell__history");
          return (
            history !== null &&
            history.getBoundingClientRect().width >= 350 &&
            document.documentElement.scrollWidth <= window.innerWidth
          );
        }),
      {
        timeoutMsg:
          "expected the minimum-window layout to settle without squeezing history",
      },
    );
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-workspace-tabs-dark.png"),
    );
    await $(".preferences-menu__toggle").click();
    await browser.execute(() => {
      const select = document.querySelector<HTMLSelectElement>(
        ".theme-selector__select",
      );
      if (select === null) throw new Error("Theme selector is missing");
      select.value = "light";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await $(".preferences-menu__toggle").click();
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-workspace-tabs-light.png"),
    );
    await $(`[aria-label="Cerrar ${alpha}"]`).click();
    await expect($$('[role="tab"]')).toBeElementsArrayOfSize(1);
    await $(`[aria-label="Cerrar ${beta}"]`).click();
    await expect($$('[role="tab"]')).toBeElementsArrayOfSize(0);
    await expect(
      $(`.project-library__open[title$="${alpha}"]`),
    ).toBeDisplayed();
    await expect($$('[aria-label="Favoritos"] li')).toBeElementsArrayOfSize(
      200,
    );
    const last = await $(
      '[aria-label="Favoritos"] li:last-child .project-library__open',
    );
    await last.scrollIntoView();
    await expect(last).toBeDisplayed();
    const scrollable = await browser.execute(() => {
      const pane = document.querySelector(".app-shell__empty");
      return (
        pane !== null &&
        pane.scrollHeight > pane.clientHeight &&
        document.documentElement.scrollWidth <= window.innerWidth
      );
    });
    expect(scrollable).toBe(true);
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-workspace-library.png"),
    );
    await $(`.project-library__open[title$="${alpha}"]`).scrollIntoView();
    await browser.waitUntil(
      () => {
        const stored: unknown = JSON.parse(
          fs.readFileSync(path.join(e2eDataDir, "workspace.json"), "utf8"),
        );
        if (
          typeof stored !== "object" ||
          stored === null ||
          !("workspace" in stored)
        )
          return false;
        const workspace = stored.workspace;
        return (
          typeof workspace === "object" &&
          workspace !== null &&
          "tabs" in workspace &&
          Array.isArray(workspace.tabs) &&
          workspace.tabs.length === 0 &&
          "favorites" in workspace &&
          Array.isArray(workspace.favorites) &&
          workspace.favorites.includes(e2eRepository)
        );
      },
      {
        timeoutMsg:
          "expected the Rust store to persist closed tabs and the surviving favorite",
      },
    );
    await $(`.project-library__open[title$="${alpha}"]`).click();
    await expectProject(
      "workspace alpha commit",
      "alpha-local.txt",
      "beta-local.txt",
    );
    await expect($$('[role="tab"]')).toBeElementsArrayOfSize(1);
    await $(".preferences-menu__toggle").click();
    await browser.execute(() => {
      const select = document.querySelector<HTMLSelectElement>(
        ".theme-selector__select",
      );
      if (select === null) throw new Error("Theme selector is missing");
      select.value = "dark";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await $(".preferences-menu__toggle").click();
  });
});
