import { execFileSync } from "node:child_process";
import { browser, $, $$ } from "@wdio/globals";
import { WebDriverVideoRecorder } from "../../../../bitacora-engine/core/video/adapters/wdio.mjs";

const output = process.env.GITCANVAS_RECORDING_OUTPUT;
const audio = process.env.GITCANVAS_RECORDING_AUDIO;
const repository = process.env.GITCANVAS_E2E_REPO;
const language = process.env.GITCANVAS_VIDEO_LANGUAGE ?? "es";
const durations = JSON.parse(
  process.env.GITCANVAS_NARRATION_DURATIONS ?? "[]",
) as number[];
const fps = 25;

describe("GitCanvas product walkthrough recording", () => {
  const record = output === undefined ? it.skip : it;

  record("records the Atlas Storefront history walkthrough", async () => {
    const handles = await browser.getWindowHandles();
    if (handles[0] !== undefined) await browser.switchToWindow(handles[0]);
    await browser.setWindowSize(1440, 900);
    await browser.waitUntil(
      async () =>
        (await $$('[role="option"]').length) >= 5 &&
        (await $(".working-tree-row").isExisting()),
      {
        timeout: 30_000,
        timeoutMsg: "GitCanvas did not render the Atlas Storefront history",
      },
    );
    if (durations.length !== 4)
      throw new Error("Expected four narration segments");
    if (repository === undefined)
      throw new Error("GITCANVAS_E2E_REPO is required for the recording");
    const outputPath = output;
    if (outputPath === undefined)
      throw new Error(
        "GITCANVAS_RECORDING_OUTPUT is required for the recording",
      );

    const recorder = new WebDriverVideoRecorder({
      browser,
      outputPath,
      ...(audio === undefined ? {} : { audioPath: audio }),
      brandTag:
        language === "en" ? "REPOSITORY WALKTHROUGH" : "DEMO DE REPOSITORIO",
      width: 1440,
      height: 900,
      fps,
    });
    const holdRemainder = async (seconds: number, alreadyUsed: number) => {
      await recorder.hold(Math.max(1, Math.round(seconds * fps) - alreadyUsed));
    };
    const selectRowWithText = async (text: string, target: string) => {
      await browser.execute(
        ({ text, target }) => {
          const row = [...document.querySelectorAll('[role="option"]')].find(
            (item) => item.textContent?.includes(text),
          );
          row?.setAttribute("data-demo-target", target);
        },
        { text, target },
      );
    };

    await recorder.init();
    try {
      await recorder.splash(
        "",
        "GitCanvas",
        language === "en"
          ? "Your project history, at a glance"
          : "La historia de tu proyecto, de un vistazo",
        45,
      );
      await recorder.banner(
        language === "en" ? "Branches and commits" : "Ramas y commits",
        language === "en"
          ? "Atlas Storefront's history in one graph."
          : "La historia de Atlas Storefront en un mismo grafo.",
        language === "en" ? "GIT HISTORY" : "HISTORIA GIT",
      );
      await selectRowWithText("Merge pull request #24", "pull-request-merge");
      await recorder.hold(38);
      await recorder.click('[data-demo-target="pull-request-merge"]');
      await holdRemainder(durations[0] ?? 0, 8 + 38 + 30 + 15);

      await recorder.banner(
        language === "en" ? "Local changes" : "Cambios locales",
        language === "en"
          ? "Review staged files and the changes still in your workspace."
          : "Revisa lo preparado y lo que sigue en tu espacio de trabajo.",
        language === "en" ? "BEFORE COMMIT" : "ANTES DEL COMMIT",
      );
      await recorder.click(".working-tree-row");
      await browser.execute(() => {
        const row = document.querySelector(
          'section[aria-label="Sin preparar"] button.file-row',
        );
        row?.setAttribute("data-demo-target", "unstaged-file");
      });
      await recorder.click('[data-demo-target="unstaged-file"]');
      await holdRemainder(durations[1] ?? 0, 8 + 45 + 45);

      await browser.execute(() => {
        const back = [...document.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Volver al graph"),
        );
        back?.setAttribute("data-demo-target", "back-to-graph");
      });
      await recorder.click('[data-demo-target="back-to-graph"]');
      execFileSync(
        "git",
        ["-C", repository, "add", "src/cart.ts", "src/styles.css"],
        { stdio: "pipe" },
      );
      execFileSync(
        "git",
        [
          "-C",
          repository,
          "-c",
          "user.name=Alex Rivera",
          "-c",
          "user.email=demo@example.test",
          "commit",
          "-m",
          "feat: add cart totals and refine spacing",
        ],
        { stdio: "pipe" },
      );
      await recorder.banner(
        language === "en"
          ? "A new commit in the history"
          : "Un nuevo commit en la historia",
        language === "en"
          ? "Refresh the repository to bring the latest change into view."
          : "GitCanvas relee el repositorio y deja visible el último cambio.",
        language === "en" ? "REFRESH" : "ACTUALIZAR",
      );
      await recorder.click(
        'button[title="Volver a leer el repositorio desde el disco"]',
      );
      await browser.waitUntil(
        async () =>
          await browser.execute(() =>
            [...document.querySelectorAll('[role="option"]')].some((row) =>
              row.textContent?.includes("feat: add cart totals"),
            ),
          ),
        {
          timeout: 15_000,
          timeoutMsg: "The new Git commit did not appear in the history",
        },
      );
      await selectRowWithText("feat: add cart totals", "new-commit");
      await recorder.click('[data-demo-target="new-commit"]');
      await holdRemainder(durations[2] ?? 0, 8 + 45 * 3);

      await browser.waitUntil(
        async () => await $('[aria-label="Archivos modificados"]').isExisting(),
        { timeout: 10_000 },
      );
      await browser.execute(() => {
        const files = [
          ...document.querySelectorAll(
            '[aria-label="Archivos modificados"] button.file-row',
          ),
        ];
        const cart = files.find((file) =>
          file.textContent?.includes("cart.ts"),
        );
        cart?.setAttribute("data-demo-target", "cart-diff");
      });
      await recorder.banner(
        language === "en" ? "Inside the new commit" : "Dentro del nuevo commit",
        language === "en"
          ? "Review the author, changed files, and diff together."
          : "Autor, archivos y diff quedan juntos para revisar.",
        language === "en" ? "RECENT CHANGE" : "CAMBIO RECIENTE",
      );
      await recorder.click('[data-demo-target="cart-diff"]');
      await holdRemainder(durations[3] ?? 0, 8 + 45);
      await recorder.hold(language === "en" ? Math.round(fps * 2.5) : fps);
    } finally {
      await recorder.finish();
    }
  });
});
