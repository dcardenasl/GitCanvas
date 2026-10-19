import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { e2eDataDir } from "../wdio.conf";
import { waitForHistory } from "./history";

/** Measurements are reported, not compared against hardware-dependent CI timings. */
describe("large repository graph", () => {
  it("keeps a twelve-trajectory, ten-thousand-commit history virtualized while scrolling", async () => {
    await waitForHistory(10);
    await $('[aria-label="Acciones de main"]').click();
    await $('[role="menuitem"]*=Usar como principal visual').click();
    const result = await browser.executeAsync<
      {
        frames: number;
        elapsed: number;
        maxNodes: number;
        maxPaths: number;
        maxGap: number;
      },
      []
    >((done) => {
      const table = document.querySelector(".commit-table");
      const started = performance.now();
      let frames = 0;
      let previous = started;
      let maxGap = 0;
      let maxNodes = 0;
      let maxPaths = 0;
      const step = (now: number) => {
        maxGap = Math.max(maxGap, now - previous);
        previous = now;
        maxNodes = Math.max(
          maxNodes,
          document.querySelectorAll(".graph-canvas circle").length,
        );
        maxPaths = Math.max(
          maxPaths,
          document.querySelectorAll(".graph-canvas__edge").length,
        );
        if (table !== null) table.scrollTop = frames * 32;
        frames += 1;
        if (frames < 180) requestAnimationFrame(step);
        else
          done({ frames, elapsed: now - started, maxNodes, maxPaths, maxGap });
      };
      requestAnimationFrame(step);
    });
    expect(result.maxNodes).toBeLessThan(100);
    expect(result.maxPaths).toBeGreaterThan(12);
    const report = {
      fixture: "10000 commits plus 11 branch tips; 12 concurrent trajectories",
      platform: process.platform,
      architecture: process.arch,
      viewport: await browser.getWindowSize(),
      ...result,
      framesPerSecond: (result.frames * 1000) / result.elapsed,
    };
    fs.writeFileSync(
      path.join(os.tmpdir(), "gitcanvas-v04-performance.json"),
      JSON.stringify(report, null, 2),
    );
    // The Rust logger records reference and first-page data durations separately.
    const logs = path.join(e2eDataDir, "logs");
    if (fs.existsSync(logs)) {
      fs.writeFileSync(
        path.join(os.tmpdir(), "gitcanvas-v04-performance-backend.log"),
        fs
          .readdirSync(logs)
          .map((name) => fs.readFileSync(path.join(logs, name), "utf8"))
          .join("\n"),
      );
    }
    await browser.saveScreenshot(
      path.join(os.tmpdir(), "gitcanvas-v04-large-graph.png"),
    );
  });
});
