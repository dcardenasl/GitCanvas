import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import {
  e2eRepository,
  e2eRepositoryRoot,
  e2eSecondRepository,
  e2eDataDir,
} from "../wdio.conf";
import { waitForHistory } from "./history";

const alpha = path.basename(e2eRepository);
if (e2eSecondRepository === null)
  throw new Error("Workspace spec requires its two owned fixtures");
const beta = path.basename(e2eSecondRepository);

async function resizeWorkspace() {
  await browser.setWindowSize(940, 600);
  // WebKit may suspend page callbacks during native resizing. A short WDIO
  // pause lets the layout settle without relying on executeAsync in the page.
  await browser.pause(50);
}

/** Shows the start screen, with the favorites and recents, from the Home tab. */
async function openHome() {
  await $('[role="tab"][data-home]').click();
}

async function expectProject(
  summary: string,
  localFile: string,
  otherFile: string,
) {
  await waitForHistory();
  await expect($('[role="row"]')).toHaveText(expect.stringContaining(summary));
  const panel = await $('[aria-label="Cambios locales"]');
  await expect(panel).toHaveText(expect.stringContaining(localFile));
  await expect(panel).not.toHaveText(expect.stringContaining(otherFile));
}

describe("workspace projects", () => {
  it("keeps thirty restored tabs reachable through a bounded, scrollable menu", async () => {
    await waitForHistory();
    await resizeWorkspace();
    const tabLayout = await browser.execute(() => {
      const strip = document.querySelector<HTMLElement>(".tab-bar__tabs");
      const tabs = Array.from(
        strip?.querySelectorAll<HTMLElement>(
          ".tab-bar__tab:not(.tab-bar__tab--home)",
        ) ?? [],
      );
      return {
        stripOverflows: strip !== null && strip.scrollWidth > strip.clientWidth,
        projectTabWidths: tabs.map((tab) => tab.getBoundingClientRect().width),
      };
    });
    expect(tabLayout.stripOverflows).toBe(true);
    expect(tabLayout.projectTabWidths.length).toBe(30);
    expect(tabLayout.projectTabWidths.every((width) => width >= 180)).toBe(
      true,
    );
    await $('[aria-label="Todos los proyectos abiertos"]').click();
    await expect($$('[role="menuitem"]')).toBeElementsArrayOfSize(30);
    await browser.keys("End");
    const bounded = await browser.execute(() => {
      const menu = document.querySelector('[role="menu"]');
      const bounds = menu?.getBoundingClientRect();
      return (
        menu !== null &&
        bounds !== undefined &&
        bounds.top >= 0 &&
        bounds.bottom <= window.innerHeight &&
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth &&
        menu.scrollHeight > menu.clientHeight &&
        menu.contains(document.activeElement)
      );
    });
    expect(bounded).toBe(true);
    await expect($('[role="menu"]')).toBeDisplayed();
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-workspace-overflow.png"),
    );
    await browser.execute(() => {
      const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items.item(items.length - 1)?.click();
    });
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const strip = document.querySelector<HTMLElement>(".tab-bar__tabs");
          const selected = strip?.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]:not([data-home])',
          );
          if (strip === null || selected === undefined || selected === null)
            return false;
          const stripBounds = strip.getBoundingClientRect();
          const tabBounds = selected.getBoundingClientRect();
          return (
            tabBounds.left >= stripBounds.left &&
            tabBounds.right <= stripBounds.right &&
            selected.getAttribute("title")?.endsWith("remembered-tab-29")
          );
        }),
      { timeout: 5_000, timeoutMsg: "selected tab did not scroll into view" },
    );
    await browser.execute((name) => {
      const tab = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.tab-bar__tabs [role="tab"]:not([data-home])',
        ),
      ).find((candidate) => candidate.getAttribute("title")?.endsWith(name));
      tab?.click();
    }, alpha);
    await expect(
      $('[role="tab"][aria-selected="true"]:not([data-home])'),
    ).toHaveAttribute("title", expect.stringContaining(alpha));
    // Close only the inactive remembered tabs through the application's controls.
    await browser.execute((name) => {
      for (const tab of document.querySelectorAll(
        '[role="tab"]:not([data-home])',
      )) {
        if (!tab.getAttribute("title")?.endsWith(name)) {
          tab.parentElement
            ?.querySelector<HTMLButtonElement>(".tab-bar__close")
            ?.click();
        }
      }
    }, alpha);
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      1,
    );
  });
  it("restores the first tab, opens a second and isolates history and local changes while switching", async () => {
    await expectProject(
      "workspace alpha commit",
      "alpha-local.txt",
      "beta-local.txt",
    );
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      1,
    );
    await openHome();
    await $(`.project-library__open[title$="${beta}"]`).click();
    await expectProject(
      "workspace beta commit",
      "beta-local.txt",
      "alpha-local.txt",
    );
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      2,
    );
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
    await openHome();
    await $(`.project-library__open[title$="${alpha}"]`).click();
    await expectProject(
      "workspace alpha commit",
      "alpha-local.txt",
      "beta-local.txt",
    );
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      2,
    );
    await $(`[aria-label="Agregar ${alpha} a favoritos"]`).click();
    await resizeWorkspace();
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
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      1,
    );
    await $(`[aria-label="Cerrar ${beta}"]`).click();
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      0,
    );
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
          workspace.favorites.includes(e2eRepositoryRoot)
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
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      1,
    );
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
