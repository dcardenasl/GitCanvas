import os from "node:os";
import path from "node:path";

import { $, browser, expect, $$ } from "@wdio/globals";
import { Key } from "webdriverio";

import { e2eRepository } from "../wdio.conf";
import { waitForHistory } from "./history";
import { setReactSelectValue } from "./interactions";

describe("author and release panels", () => {
  before(async () => {
    await browser.setWindowSize(940, 600);
    await waitForHistory(3);
  });

  async function setAppearance(language: "en" | "es", theme: "light" | "dark") {
    const preferences = await $(".preferences-menu__toggle");
    await preferences.click();
    await setReactSelectValue(".language-selector__select", language);
    await setReactSelectValue(".theme-selector__select", theme);
    await browser.waitUntil(
      async () => (await $("html").getAttribute("lang")) === language,
      { timeoutMsg: `expected ${language} interface` },
    );
    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () => document.documentElement.dataset.theme,
        )) === theme,
      { timeoutMsg: `expected ${theme} theme` },
    );
    await preferences.click();
  }

  it("keeps author and release panels usable in EN/ES and both themes at 940×600", async () => {
    const authorPanel = await $(".author-panel");
    const releasePanel = await $(".tags-releases-panel");
    await authorPanel.waitForDisplayed({ timeout: 20_000 });
    await browser.setWindowSize(940, 600);

    for (const [language, theme] of [
      ["en", "light"],
      ["es", "light"],
      ["en", "dark"],
      ["es", "dark"],
    ] as const) {
      await setAppearance(language, theme);
      await releasePanel.waitForDisplayed({ timeout: 20_000 });
      await expect(releasePanel).toHaveText(
        expect.stringContaining(
          language === "en"
            ? "This repository does not use a supported GitHub remote"
            : "Este repositorio no usa un remoto GitHub compatible",
        ),
      );

      const layout = await browser.execute(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.viewportWidth).toBe(940);
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);

      await browser.executeAsync((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
      });
      await browser.saveScreenshot(
        path.join(os.tmpdir(), `gitcanvas-cr15-${language}-${theme}.png`),
      );
    }
  });

  it("exposes author controls to keyboard users and navigates with Alt+Left", async () => {
    await setAppearance("en", "light");
    const authorPanel = await $(".author-panel");
    await authorPanel.scrollIntoView();
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document
              .querySelector(".author-panel__progress")
              ?.textContent?.includes("Author catalog complete") === true,
        ),
      { timeout: 20_000, timeoutMsg: "author catalog did not complete" },
    );

    const search = await $(".author-panel__search");
    await expect(search).toHaveAttribute("id", "author-panel-search");
    await expect($("label[for='author-panel-search']")).toHaveText(
      "Search authors",
    );
    await search.addValue("ada@");
    await browser.waitUntil(
      async () => (await $$(".author-panel__author").length) === 1,
    );

    const ada = await $(".author-panel__author");
    await expect(ada).toHaveText(expect.stringContaining("Ada Lovelace"));
    await expect(ada).toHaveAttribute("aria-pressed", "false");
    await ada.click();
    await expect(ada).toHaveAttribute("aria-pressed", "true");

    const previous = await $(".author-panel__navigation button:first-child");
    const next = await $(".author-panel__navigation button:last-child");
    await expect(previous).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+ArrowLeft",
    );
    await expect(next).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowRight");
    await search.click();
    await browser.keys(Key.Tab);
    await expect(ada).toBeFocused();
    await browser.keys(Key.Tab);
    await expect(previous).toBeFocused();
    await browser.keys(Key.Tab);
    await expect(next).toBeFocused();

    await browser.execute(() => {
      const button = document.querySelector<HTMLElement>(
        ".author-panel__navigation button:first-child",
      );
      button?.focus();
    });
    await browser.keys([Key.Alt, Key.ArrowLeft]);
    await browser.waitUntil(() =>
      browser.execute(
        () =>
          document
            .querySelector(".author-panel__status")
            ?.textContent?.includes("Moved to the previous commit") === true,
      ),
    );
    await expect($("[role='row'].commit-row--selected")).toHaveText(
      expect.stringContaining("Ada first"),
    );
    await expect($(".author-panel__progress")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(e2eRepository).toContain("gitcanvas-e2e-");
  });
});
