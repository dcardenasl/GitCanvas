import os from "node:os";
import path from "node:path";

import { browser, expect } from "@wdio/globals";

import { waitForHistory } from "./history";

describe("image comparison", () => {
  before(async () => {
    await browser.setWindowSize(940, 600);
    await waitForHistory(4);
  });

  it("opens the binary commit image in English and Spanish across themes", async () => {
    for (const [language, theme] of [
      ["en", "light"],
      ["es", "dark"],
    ] as const) {
      await (await browser.$(".preferences-menu__toggle")).click();
      await browser.execute(
        (nextLanguage: string, nextTheme: string) => {
          const languageSelect = document.querySelector<HTMLSelectElement>(
            ".language-selector__select",
          );
          const themeSelect = document.querySelector<HTMLSelectElement>(
            ".theme-selector__select",
          );
          if (languageSelect === null || themeSelect === null)
            throw new Error("Preferences are unavailable");
          languageSelect.value = nextLanguage;
          languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
          themeSelect.value = nextTheme;
          themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        },
        language,
        theme,
      );
      await (await browser.$(".preferences-menu__toggle")).click();

      const commit = await browser.$(
        '//*[@role="row"][contains(., "resize logo image")]',
      );
      await commit.waitForDisplayed({ timeout: 20_000 });
      await commit.click();
      const more = await browser.$(
        '//aside[@aria-label="Commit details" or @aria-label="Detalle del commit"]//button[@aria-label="More actions for logo.png" or @aria-label="Más acciones de logo.png"]',
      );
      await more.waitForDisplayed({ timeout: 20_000 });
      await more.click();
      await (
        await browser.$(
          '//button[@role="menuitem"][normalize-space()="History" or normalize-space()="Historial"]',
        )
      ).click();
      await browser.$(".file-history").waitForDisplayed({ timeout: 20_000 });
      await (await browser.$(".file-history__rows button")).click();
      await expect(await browser.$(".file-diff")).toHaveText(
        expect.stringContaining(language === "en" ? "Previous" : "Anterior"),
      );
      const noOverflow = await browser.execute(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(noOverflow).toBe(true);
      await browser.saveScreenshot(
        path.join(os.tmpdir(), `gitcanvas-images-${language}-${theme}.png`),
      );
      await (
        await browser.$(
          `//button[normalize-space()="${language === "en" ? "Back to graph" : "Volver al gráfico"}"]`,
        )
      ).click();
    }
  });
});
