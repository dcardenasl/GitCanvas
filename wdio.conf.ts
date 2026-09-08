import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/**
 * End-to-end configuration.
 *
 * `@wdio/tauri-service` rather than `tauri-driver`: Apple ships no WebDriver
 * for WKWebView, so `tauri-driver` cannot run on macOS at all. This service
 * runs an embedded server inside the application and works on all three
 * platforms, which is what lets the same suite run locally and in CI.
 *
 * The binary under test is a real build, not a dev server, so what is verified
 * is what would ship.
 */

/**
 * Where `tauri build` leaves the executable, which differs per platform.
 *
 * macOS produces an app bundle; Linux and Windows leave a plain binary in the
 * profile directory.
 */
function applicationPath(): string {
  // The plain release binary, built with `--features e2e`, rather than the
  // bundle: bundling is a packaging step that adds nothing this suite tests,
  // and on macOS it drives Finder through AppleScript, which cannot run
  // unattended.
  return path.resolve(
    process.platform === "win32"
      ? "target/release/gitcanvas.exe"
      : "target/release/gitcanvas",
  );
}

/**
 * A repository with a merge, built before the application starts.
 *
 * It has to exist here rather than in the spec: the application receives its
 * path as a launch argument, and by the time a spec runs the window is already
 * open.
 */
function createFixtureRepository(): string {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "gitcanvas-e2e-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repository, ...args], { stdio: "pipe" });

  execFileSync("git", ["init", "-b", "main", repository], { stdio: "pipe" });
  git("config", "user.email", "e2e@example.com");
  git("config", "user.name", "End To End");

  fs.writeFileSync(path.join(repository, "a.txt"), "one\n");
  git("add", "a.txt");
  git("commit", "-m", "first commit");

  git("checkout", "-b", "side");
  fs.writeFileSync(path.join(repository, "a.txt"), "one\ntwo\n");
  git("commit", "-am", "second commit on side");

  git("checkout", "main");
  git("merge", "--no-ff", "side", "-m", "merge side into main");

  return repository;
}

const fixture = createFixtureRepository();

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.e2e.json",

  specs: ["./e2e/**/*.spec.ts"],
  maxInstances: 1,

  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: applicationPath(),
        // The repository to open, passed the same way a terminal user would.
        args: [fixture],
      },
    } as WebdriverIO.Capabilities,
  ],

  services: ["@wdio/tauri-service"],
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",

  // A cold start compiles nothing but does open a window and read a repository.
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  mochaOpts: { ui: "bdd", timeout: 120_000 },

  onComplete() {
    fs.rmSync(fixture, { recursive: true, force: true });
  },
};
