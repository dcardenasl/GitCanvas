import { $, $$, browser, expect } from "@wdio/globals";

/**
 * The path the whole application exists to serve: open a repository, read the
 * graph, select a commit, read its diff.
 *
 * Unit tests cover each piece; this covers that the pieces are actually wired
 * to each other in a real window, which is the one thing they cannot.
 *
 * The repository is created and passed as a launch argument by `wdio.conf.ts`,
 * so by the time this runs the history is already on screen.
 */
describe("open a repository and read a commit", () => {
  before(async () => {
    // A fixed pause is a coin flip on a loaded machine: cold-start time
    // varies with whatever else is running. Wait for the actual signal that
    // the history rendered instead of guessing how long that takes.
    await browser.waitUntil(
      async () => (await $$('[role="option"]').length) > 0,
      {
        timeout: 20_000,
        timeoutMsg: "the commit history never rendered",
      },
    );
  });

  it("draws the history over the commit rows", async () => {
    const rows = await $$('[role="option"]');
    await expect(rows).toBeElementsArrayOfSize({ gte: 3 });

    const nodes = await $$(".graph-canvas circle");
    await expect(nodes).toBeElementsArrayOfSize({ gte: 3 });
  });

  it("draws the merge as a curve rather than a straight line", async () => {
    const curves = await browser.execute(
      () =>
        [...document.querySelectorAll(".graph-canvas path")].filter((path) =>
          path.getAttribute("d")?.includes("C"),
        ).length,
    );
    expect(curves).toBeGreaterThan(0);
  });

  it("shows the diff of the commit that is selected", async () => {
    const rows = await $$('[role="option"]');
    const row = rows[0];
    if (row === undefined) throw new Error("Expected a commit in history");
    await row.click();

    const panel = await $('[aria-label="Detalle del commit"]');
    await expect(panel).toBeDisplayed();
    // `toHaveTextContaining` was removed in WebdriverIO v9.
    await expect(panel).toHaveText(
      expect.stringContaining("merge side into main"),
    );
  });
});
