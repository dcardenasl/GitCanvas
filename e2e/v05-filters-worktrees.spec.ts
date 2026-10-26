import { $, $$, browser, expect } from "@wdio/globals";
import { e2eRepositoryRoot } from "../wdio.conf";
import { waitForHistory } from "./history";
import { clickAndConfirm, setReactSelectValue } from "./interactions";

describe("v0.5 reference filters and linked worktrees", () => {
  it("keeps the reference and worktree controls translated at minimum size", async () => {
    await waitForHistory(3);
    await browser.setWindowSize(940, 600);
    await browser.executeAsync((done) => {
      window.setTimeout(() => done(null), 50);
    });
    const previousPreferences = await browser.execute(() => {
      const theme = document.querySelector<HTMLSelectElement>(
        ".theme-selector__select",
      );
      const language = document.querySelector<HTMLSelectElement>(
        ".language-selector__select",
      );
      if (theme === null || language === null)
        throw new Error("Preference selectors are missing");
      return { theme: theme.value, language: language.value };
    });

    const setPreferences = async (theme: string, language: string) => {
      await clickAndConfirm(
        ".preferences-menu__toggle",
        async () => await expect($(".preferences-menu__panel")).toBeDisplayed(),
      );
      await setReactSelectValue(".theme-selector__select", theme);
      await setReactSelectValue(".language-selector__select", language);
      await clickAndConfirm(
        ".preferences-menu__toggle",
        async () =>
          await expect($(".preferences-menu__panel")).not.toBeDisplayed(),
      );
    };

    try {
      await setPreferences("light", "es");
      await expect($('[aria-label="Ramas y etiquetas"]')).toBeDisplayed();
      await expect(
        $('input[placeholder="Buscar ramas y etiquetas"]'),
      ).toBeDisplayed();
      await expect($('[aria-label="Worktrees vinculados"]')).toBeDisplayed();
      await expect($('[aria-label="Ramas y etiquetas"]')).toHaveText(
        expect.stringContaining("Incluir HEAD"),
      );
      const spanish = await browser.execute(() => ({
        language: document.documentElement.lang,
        theme: document.documentElement.dataset.theme,
      }));
      expect(spanish).toEqual({ language: "es", theme: "light" });

      await setPreferences("dark", "en");
      await expect($('[aria-label="Branches and tags"]')).toBeDisplayed();
      await expect(
        $('input[placeholder="Search branches and tags"]'),
      ).toBeDisplayed();
      await expect($('[aria-label="Linked worktrees"]')).toBeDisplayed();
      await expect($('[aria-label="Branches and tags"]')).toHaveText(
        expect.stringContaining("Include HEAD"),
      );
      const english = await browser.execute(() => ({
        language: document.documentElement.lang,
        theme: document.documentElement.dataset.theme,
      }));
      expect(english).toEqual({ language: "en", theme: "dark" });

      const viewport = await browser.execute(() => ({
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }));
      expect(viewport).toEqual({ width: 940, overflow: false });
    } finally {
      await setPreferences(
        previousPreferences.theme,
        previousPreferences.language,
      );
    }
  });

  it("walks only the selected refs and preserves an excluded commit detail", async () => {
    await waitForHistory(3);

    const merge = await $('[role="option"]*=merge side into main');
    await merge.click();
    await $(".sidebar__filters input[type='checkbox']").click();
    await $('[aria-label="Alternar todas las referencias de Local"]').click();
    await $(
      '[aria-label="Alternar todas las referencias de Etiquetas"]',
    ).click();
    await $('[aria-label="Incluir side-snapshot en el historial"]').click();

    await browser.waitUntil(
      async () =>
        !(await $('[role="option"]*=merge side into main').isExisting()),
      { timeoutMsg: "the filtered walk still included the main-only merge" },
    );
    await expect(
      $('[aria-label="Detalle del commit"] [role="status"]'),
    ).toHaveText(
      expect.stringContaining(
        "Este commit está fuera de las referencias incluidas en el historial.",
      ),
    );
    await expect($('[role="option"]*=second commit on side')).toBeDisplayed();

    await $(
      '//aside[@aria-label="Detalle del commit"]//button[contains(normalize-space(.), "Mostrar todas las referencias y localizar commit")]',
    ).click();
    await browser.waitUntil(
      async () => await $('[role="option"]*=merge side into main').isExisting(),
    );
    await expect(
      $('[aria-label="Detalle del commit"] [role="status"]'),
    ).not.toBeDisplayed();

    await $(".sidebar__filters input[type='checkbox']").click();
    await $('[aria-label="Alternar todas las referencias de Local"]').click();
    await $(
      '[aria-label="Alternar todas las referencias de Etiquetas"]',
    ).click();
    await expect($(".history-view__state")).toHaveText(
      expect.stringContaining("No hay referencias incluidas en el historial."),
    );
    await expect($(".working-tree-row")).toHaveText(
      expect.stringContaining("Cambios locales"),
    );
  });

  it("opens an occupied branch worktree and reuses its tab", async () => {
    await $("button*=Mostrar todo").click();
    await waitForHistory(3);
    const inventory = await $('[aria-label="Worktrees vinculados"]');
    await expect(inventory).toBeDisplayed();
    await expect(inventory).toHaveText(expect.stringContaining("side"));
    await $('[aria-label="Actualizar worktrees"]').click();
    await browser.waitUntil(
      async () =>
        (await $('[aria-label="Worktrees vinculados"]').getAttribute(
          "aria-busy",
        )) === "false",
      { timeoutMsg: "the linked-worktree inventory did not finish refreshing" },
    );

    const sideRoot = await browser.execute(() => {
      const side = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".sidebar__worktree"),
      ).find((button) => button.textContent?.includes("side") === true);
      if (side === undefined) throw new Error("The side worktree is missing");
      return side.title;
    });
    await clickAndConfirm(
      '[aria-label="Acciones de side"]',
      async () =>
        await expect(
          $('[role="menuitem"]*=Abrir el worktree que usa esta rama'),
        ).toBeDisplayed(),
    );
    await clickAndConfirm(
      '[role="menuitem"]*=Abrir el worktree que usa esta rama',
      async () => {
        await browser.waitUntil(() =>
          browser.execute((root) => {
            const active = document.querySelector<HTMLButtonElement>(
              '[role="tab"][aria-selected="true"]:not([data-home])',
            );
            return active?.title === root;
          }, sideRoot),
        );
      },
    );
    await expect($$("[data-repository-group]")).toBeElementsArrayOfSize(2);

    await clickAndConfirm(
      `.sidebar__worktree[title="${e2eRepositoryRoot}"]`,
      async () => {
        await browser.waitUntil(() =>
          browser.execute((root) => {
            const active = document.querySelector<HTMLButtonElement>(
              '[role="tab"][aria-selected="true"]:not([data-home])',
            );
            return active?.title === root;
          }, e2eRepositoryRoot),
        );
      },
    );
    await expect($$('[role="tab"]:not([data-home])')).toBeElementsArrayOfSize(
      2,
    );
  });

  it("opens the filtered sidebar temporarily without replacing the file diff", async () => {
    await $("button*=Mostrar todo").click();
    await waitForHistory(3);
    await $('[aria-label="Incluir side-snapshot en el historial"]').click();
    const merge = await $('[role="option"]*=merge side into main');
    await merge.click();
    await $('[aria-label="Detalle del commit"] .file-row').click();
    await browser.waitUntil(async () => await $(".file-diff").isDisplayed(), {
      timeoutMsg: "the selected commit file diff never opened",
    });

    const diffBefore = await $(".file-diff").getText();
    const indicator = await $('button[title^="Filtros ("]');
    await expect(indicator).toBeDisplayed();
    await indicator.click();
    await expect(indicator).toHaveAttribute("aria-expanded", "true");
    await expect($(".file-diff")).toBeDisplayed();
    await expect($(".file-diff")).toHaveText(diffBefore);
    await expect(
      $('button[title="Mostrar las ramas mientras se lee un archivo"]'),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
