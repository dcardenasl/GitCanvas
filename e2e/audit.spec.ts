import { $, $$, browser } from "@wdio/globals";

/**
 * A driven pass over the interface, reporting what it finds rather than
 * asserting. This is an audit, not a regression suite: it exists to surface
 * problems a person would notice, so it prints and never fails.
 */
describe("interface audit", () => {
  const findings: string[] = [];

  function note(area: string, detail: string) {
    findings.push(`${area}: ${detail}`);
  }

  before(async () => {
    await browser.setWindowSize(1280, 800);
    await browser.pause(3500);
  });

  after(() => {
    console.log("AUDIT_START");
    for (const finding of findings) console.log(`FINDING ${finding}`);
    console.log("AUDIT_END");
  });

  it("checks what the window announces", async () => {
    const title = await browser.getTitle();
    note("window title", title);
  });

  it("measures the panels", async () => {
    const sizes = await browser.execute(() => {
      const box = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return "absent";
        const r = el.getBoundingClientRect();
        return `${String(Math.round(r.width))}x${String(Math.round(r.height))}`;
      };
      return {
        sidebar: box(".sidebar"),
        history: box(".app-shell__history"),
        inspector: box(".detail-panel"),
        viewport: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
      };
    });
    note("panel sizes", JSON.stringify(sizes));
  });

  it("looks for a commit search", async () => {
    const inputs = await $$("input");
    note("text inputs on screen", String(inputs.length));
  });

  it("checks whether rows carry branch or tag badges", async () => {
    const badges = await browser.execute(
      () =>
        document.querySelectorAll("[class*=ref-pill],[class*=commit-row__ref]")
          .length,
    );
    note("ref badges on commit rows", String(badges));
  });

  it("reads what a commit row shows", async () => {
    const row = await $('[role="option"]');
    note("row text", (await row.getText()).replace(/\n/g, " | "));
  });

  it("checks the inspector before anything is selected", async () => {
    const present = await browser.execute(
      () =>
        document.querySelector('[aria-label="Detalle del commit"]') !== null,
    );
    note("inspector visible with no selection", String(present));
  });

  it("checks the empty area where the inspector would be", async () => {
    const layout = await browser.execute(() => {
      const body = document.querySelector(".app-shell__body");
      return body ? getComputedStyle(body).gridTemplateColumns : "absent";
    });
    note("body columns, nothing selected", layout);
  });

  it("selects a commit and re-measures", async () => {
    const rows = await $$('[role="option"]');
    await rows[2].click();
    await browser.pause(2000);

    const layout = await browser.execute(() => {
      const body = document.querySelector(".app-shell__body");
      const panel = document.querySelector(".detail-panel");
      return {
        columns: body ? getComputedStyle(body).gridTemplateColumns : "absent",
        inspectorWidth: panel
          ? Math.round(panel.getBoundingClientRect().width)
          : 0,
      };
    });
    note("body columns, commit selected", JSON.stringify(layout));
  });

  it("checks whether the diff shows line numbers", async () => {
    const files = await $$('[aria-label="Archivos modificados"] button');
    if (files.length === 0) {
      note("file list", "empty for this commit");
      return;
    }
    await files[0].click();
    await browser.pause(2000);

    const info = await browser.execute(() => {
      const lines = document.querySelectorAll(".diff-line");
      const first = lines[0];
      return {
        lines: lines.length,
        hasLineNumbers:
          document.querySelectorAll("[class*=line-number],[class*=lineno]")
            .length > 0,
        sample: first ? first.textContent?.slice(0, 40) : "none",
        wraps: first ? getComputedStyle(first).whiteSpace : "none",
      };
    });
    note("diff viewer", JSON.stringify(info));
  });

  it("checks how a long line behaves", async () => {
    const overflow = await browser.execute(() => {
      const viewer = document.querySelector(".diff-viewer");
      if (!viewer) return "no viewer";
      return `scrollWidth=${String(viewer.scrollWidth)} clientWidth=${String(viewer.clientWidth)}`;
    });
    note("diff horizontal overflow", overflow);
  });

  it("counts what is reachable by keyboard", async () => {
    const counts = await browser.execute(() => ({
      buttons: document.querySelectorAll("button").length,
      focusable: document.querySelectorAll(
        'button:not([disabled]),a[href],input,[tabindex]:not([tabindex="-1"])',
      ).length,
      withTitle: document.querySelectorAll("[title]").length,
    }));
    note("interactive elements", JSON.stringify(counts));
  });

  it("checks the toolbar at a narrow width", async () => {
    await browser.setWindowSize(960, 700);
    await browser.pause(1500);

    const overflow = await browser.execute(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      sidebarVisible:
        document.querySelector(".sidebar") !== null &&
        getComputedStyle(document.querySelector(".sidebar") as Element)
          .display !== "none",
    }));
    note("narrow window", JSON.stringify(overflow));
    await browser.setWindowSize(1280, 800);
  });
});
