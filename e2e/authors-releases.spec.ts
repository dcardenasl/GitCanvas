import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { $, browser, expect, $$ } from "@wdio/globals";
import { Key } from "webdriverio";

import { e2eApiBaseUrl, e2eDataDir, e2eRepository } from "../wdio.conf";
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

  async function scrollAuthorPanelIntoView() {
    await browser.execute(() => {
      const sidebar = document.querySelector<HTMLElement>(".sidebar");
      if (sidebar !== null) sidebar.scrollTop = sidebar.scrollHeight;
    });
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const sidebar = document.querySelector<HTMLElement>(".sidebar");
          const panel = document.querySelector<HTMLElement>(".author-panel");
          if (sidebar === null || panel === null) return false;
          const sidebarBounds = sidebar.getBoundingClientRect();
          const panelBounds = panel.getBoundingClientRect();
          return (
            panelBounds.top >= sidebarBounds.top &&
            panelBounds.bottom <= sidebarBounds.bottom
          );
        }),
      {
        timeout: 5_000,
        timeoutMsg: "author panel did not enter the sidebar viewport",
      },
    );
  }

  it("keeps author and release panels usable in EN/ES and both themes at 940×600", async () => {
    const authorPanel = await $(".author-panel");
    const releasePanel = await $(".tags-releases-panel");
    await authorPanel.waitForDisplayed({ timeout: 20_000 });
    await browser.setWindowSize(940, 600);
    const windowSize = await browser.getWindowSize();
    expect(windowSize.width).toBe(940);
    expect(windowSize.height).toBe(600);

    for (const [language, theme] of [
      ["en", "light"],
      ["es", "light"],
      ["en", "dark"],
      ["es", "dark"],
    ] as const) {
      await setAppearance(language, theme);
      await releasePanel.waitForDisplayed({ timeout: 20_000 });
      await expect(releasePanel).toHaveText(
        expect.stringContaining("Synthetic E2E release"),
      );

      if (language === "en" && theme === "light") {
        await $('[data-release-row="91001"]').click();
        const detail = await $(".release-detail");
        await detail.waitForDisplayed({ timeout: 20_000 });
        await browser.waitUntil(
          async () =>
            (await detail.getText()).includes(
              "Release notes from the local test server.",
            ) && (await detail.getText()).includes("synthetic.txt"),
          {
            timeout: 20_000,
            timeoutMsg: "central release notes and assets did not render",
          },
        );
        const title = await $(".release-detail__title");
        await browser.waitUntil(() => title.isFocused(), {
          timeoutMsg: "opening a release should focus its central heading",
        });
        const titleOutline = await title.getCSSProperty("outline-style");
        expect(titleOutline.value).not.toBe("none");
      }

      const layout = await browser.execute(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);

      await scrollAuthorPanelIntoView();
      await browser.saveScreenshot(
        path.join(os.tmpdir(), `gitcanvas-cr17-${language}-${theme}.png`),
      );

      await browser.setWindowSize(1440, 900);
      const habitualLayout = await browser.execute(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      // Windows includes native frame insets in setWindowSize, so its WebView
      // viewport can be a few pixels narrower than the requested outer size.
      expect(habitualLayout.viewportWidth).toBeGreaterThanOrEqual(1400);
      expect(habitualLayout.documentWidth).toBeLessThanOrEqual(
        habitualLayout.viewportWidth,
      );
      await browser.saveScreenshot(
        path.join(
          os.tmpdir(),
          `gitcanvas-cr17-${language}-${theme}-habitual.png`,
        ),
      );
      await browser.setWindowSize(940, 600);
    }

    await setAppearance("en", "light");
    await browser.setWindowSize(1440, 900);
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-cr17-release-list-en-light.png"),
    );
    await $('[data-release-row="91001"]').click();
    const detail = await $(".release-detail");
    await detail.waitForDisplayed({ timeout: 20_000 });
    await browser.setWindowSize(1440, 900);
    await browser.waitUntil(
      async () =>
        (await detail.getText()).includes(
          "Release notes from the local test server.",
        ),
      { timeoutMsg: "release notes did not render at the habitual size" },
    );
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-cr17-release-detail-habitual.png"),
    );

    await $('[data-release-row="91003"]').click();
    await browser.waitUntil(
      async () =>
        (await detail.getText()).includes(
          "Notes from another release fixture.",
        ),
      { timeoutMsg: "the second release details did not replace the first" },
    );
    await $('[data-release-row="91001"]').click();
    await browser.waitUntil(
      async () =>
        (await detail.getText()).includes(
          "Release notes from the local test server.",
        ) && (await detail.getText()).includes("synthetic.txt"),
      { timeoutMsg: "returning to the first release restored stale details" },
    );

    await browser.keys(["Escape"]);
    await browser.waitUntil(
      async () => !(await $(".release-detail").isExisting()),
    );
    await expect($('[data-release-row="91001"]')).toBeFocused();

    const releaseToggle = await $('[data-releases-toggle="true"]');
    await releaseToggle.click();
    await expect(releaseToggle).toHaveAttribute("aria-expanded", "false");
    await releaseToggle.click();
    await expect(releaseToggle).toHaveAttribute("aria-expanded", "true");

    const authorToggle = await $(".author-panel .sidebar__section-toggle");
    await authorToggle.scrollIntoView();
    await authorToggle.click();
    await expect(authorToggle).toHaveAttribute("aria-expanded", "false");
    await authorToggle.click();
    await expect(authorToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("lists synthetic releases and discovers assets without credentials", async () => {
    if (e2eApiBaseUrl === null) {
      throw new Error(
        "the local release server was not injected for this spec",
      );
    }
    await setAppearance("en", "light");
    const panel = await $(".tags-releases-panel");
    await browser.waitUntil(
      async () => (await panel.getText()).includes("Synthetic E2E release"),
      { timeout: 20_000, timeoutMsg: "synthetic release did not load" },
    );

    await $('[data-release-row="91001"]').click();
    const detail = await $(".release-detail");
    await browser.waitUntil(
      async () =>
        (await detail.getText()).includes(
          "Release notes from the local test server.",
        ) && (await detail.getText()).includes("synthetic.txt"),
      {
        timeout: 20_000,
        timeoutMsg: "central release details and assets did not load",
      },
    );

    const response = await fetch(`${e2eApiBaseUrl}/_e2e/requests`);
    if (!response.ok) throw new Error("could not inspect fake REST requests");
    const requests = (await response.json()) as {
      readonly method: string;
      readonly path: string;
      readonly authorization: string | null;
    }[];
    const apiRequests = requests.filter(
      (request) => !request.path.startsWith("/_e2e/"),
    );
    expect(apiRequests.length).toBeGreaterThanOrEqual(3);
    expect(apiRequests.every((request) => request.authorization === null)).toBe(
      true,
    );
    expect(
      apiRequests.every((request) =>
        request.path.startsWith("/repos/e2e-owner/e2e-repo/releases"),
      ),
    ).toBe(true);
    expect(
      apiRequests.some(
        (request) =>
          request.path ===
          "/repos/e2e-owner/e2e-repo/releases?per_page=100&page=1",
      ),
    ).toBe(true);
    expect(
      apiRequests.some(
        (request) =>
          request.path === "/repos/e2e-owner/e2e-repo/releases/91001",
      ),
    ).toBe(true);
    expect(
      apiRequests.some(
        (request) =>
          request.path ===
          "/repos/e2e-owner/e2e-repo/releases/91001/assets?per_page=100&page=1",
      ),
    ).toBe(true);

    await $(".release-detail button.button--primary").click();
    const transfer = await $(".release-detail__transfer");
    await browser.waitUntil(
      async () => (await transfer.getText()).includes("Download complete"),
      { timeout: 20_000, timeoutMsg: "the synthetic asset did not complete" },
    );
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-cr17-release-download-en-light.png"),
    );
    expect(
      fs.readFileSync(
        path.join(e2eDataDir, "e2e-downloads", "synthetic.txt"),
        "utf8",
      ),
    ).toBe("synthetic release asset\n");

    const afterDownload = await fetch(`${e2eApiBaseUrl}/_e2e/requests`);
    const allRequests = (await afterDownload.json()) as typeof requests;
    const allApiRequests = allRequests.filter(
      (request) => !request.path.startsWith("/_e2e/"),
    );
    expect(
      allApiRequests.every((request) => request.authorization === null),
    ).toBe(true);
    expect(
      allRequests.some(
        (request) =>
          request.path === "/repos/e2e-owner/e2e-repo/releases/assets/91002",
      ),
    ).toBe(true);
    await $(".release-detail__close").click();
  });

  it("exposes author controls and focusable navigation buttons", async () => {
    await setAppearance("en", "light");
    await scrollAuthorPanelIntoView();
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
    const rows = await $$('[role="row"].commit-row');
    let firstAdaRow: WebdriverIO.Element | undefined;
    for (const row of rows) {
      if ((await row.getText()).includes("Ada first")) {
        firstAdaRow = row;
        break;
      }
    }
    if (firstAdaRow === undefined) {
      throw new Error("Ada first commit row was not present in the fixture");
    }
    await firstAdaRow.click();
    await expect($("[role='row'].commit-row--selected")).toHaveText(
      expect.stringContaining("Ada first"),
    );
    await ada.click();
    await expect(ada).toHaveAttribute("aria-pressed", "true");

    const previous = await $(".author-panel__navigation button:first-child");
    const next = await $(".author-panel__navigation button:last-child");
    await expect(previous).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+ArrowLeft",
    );
    await expect(next).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowRight");
    await expect(previous).toBeEnabled();
    await expect(next).toBeEnabled();
    expect(
      await browser.execute(() =>
        [
          document.querySelector<HTMLElement>(".author-panel__author"),
          document.querySelector<HTMLElement>(
            ".author-panel__navigation button:first-child",
          ),
          document.querySelector<HTMLElement>(
            ".author-panel__navigation button:last-child",
          ),
        ].map((control) => control?.tabIndex),
      ),
    ).toEqual([0, 0, 0]);
    await browser.execute(() => {
      document.querySelector<HTMLElement>(".author-panel__author")?.focus();
    });
    await expect(ada).toBeFocused();
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>(
          ".author-panel__navigation button:first-child",
        )
        ?.focus();
    });
    await expect(previous).toBeFocused();
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>(
          ".author-panel__navigation button:last-child",
        )
        ?.focus();
    });
    await expect(next).toBeFocused();
    expect(e2eRepository).toContain("gitcanvas-e2e-");
  });

  it("uses Alt+Left to reveal the previous commit for the selected author", async () => {
    await setAppearance("en", "light");
    await scrollAuthorPanelIntoView();
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
    await search.setValue("ada@");
    await browser.waitUntil(
      async () => (await $$(".author-panel__author").length) === 1,
    );

    const rows = await $$('[role="row"].commit-row');
    let firstAdaRow: WebdriverIO.Element | undefined;
    for (const row of rows) {
      if ((await row.getText()).includes("Ada first")) {
        firstAdaRow = row;
        break;
      }
    }
    if (firstAdaRow === undefined) {
      throw new Error("Ada first commit row was not present in the fixture");
    }
    await firstAdaRow.click();
    await expect($("[role='row'].commit-row--selected")).toHaveText(
      expect.stringContaining("Ada first"),
    );

    const ada = await $(".author-panel__author");
    if ((await ada.getAttribute("aria-pressed")) !== "true") {
      await ada.click();
    }
    await expect(ada).toHaveAttribute("aria-pressed", "true");
    await browser.execute(() => {
      const button = document.querySelector<HTMLElement>(
        ".author-panel__navigation button:first-child",
      );
      button?.focus();
    });
    const previous = await $(".author-panel__navigation button:first-child");
    await expect(previous).toBeFocused();
    await browser
      .action("key")
      .down(Key.Alt)
      .down(Key.ArrowLeft)
      .up(Key.ArrowLeft)
      .up(Key.Alt)
      .perform();
    await browser.waitUntil(() =>
      browser.execute(
        () =>
          document
            .querySelector(".author-panel__status")
            ?.textContent?.includes("Moved to the Previous commit") === true,
      ),
    );
    await expect($("[role='row'].commit-row--selected")).toHaveText(
      expect.stringContaining("Ada latest"),
    );
    await expect($(".author-panel__progress")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(e2eRepository).toContain("gitcanvas-e2e-");
  });
});
