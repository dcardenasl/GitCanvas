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

  // Screenshot and layout specs read specific rows out of the history table
  // (the fifth, the tenth), so the merge below needs real depth behind it —
  // not just the three commits the assertions past the first row would need.
  for (let filler = 1; filler <= 8; filler += 1) {
    fs.writeFileSync(
      path.join(repository, "filler.txt"),
      `${String(filler)}\n`,
    );
    git("add", "filler.txt");
    git("commit", "-m", `filler commit ${String(filler)}`);
  }

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

/**
 * The repository the application opens.
 *
 * `GITCANVAS_E2E_REPO` points the suite at a real repository, which is how the
 * graph gets exercised against a history nobody wrote for it. Without it, a
 * purpose-built fixture is created and removed afterwards.
 */
const providedRepository = process.env.GITCANVAS_E2E_REPO;

/*
 * This file is evaluated twice: once by the launcher, which starts the
 * application against the fixture, and again inside each spec's worker, because
 * specs import `e2eRepository` from here. Without a hand-off the worker built
 * a second fixture and the spec edited a repository the application was not
 * showing, so every spec that changes the repository saw nothing happen. The
 * launcher publishes its fixture in the environment and the worker reuses it.
 */
const fixture =
  providedRepository ??
  process.env.GITCANVAS_E2E_FIXTURE ??
  createFixtureRepository();
if (providedRepository === undefined) {
  process.env.GITCANVAS_E2E_FIXTURE = fixture;
}
export const e2eRepository = fixture;

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.e2e.json",

  specs: ["./e2e/**/*.spec.ts"],
  maxInstances: 1,

  // Relaunching the app against an already-watched repository sometimes races
  // Tauri's own IPC bridge against `tauri-plugin-wdio-webdriver`'s injected
  // script: the frontend's `core.invoke` calls never resolve, so the window
  // opens but the history never renders. It is confined to this harness — the
  // plugin never ships in a release build — and a fresh relaunch does not hit
  // the same race twice in a row, which a retry of the whole spec file (a new
  // process, not just the failed assertion) is what actually clears it.
  specFileRetries: 2,
  specFileRetriesDelay: 2,

  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: applicationPath(),
      },
    } as WebdriverIO.Capabilities,
  ],

  services: [
    [
      "@wdio/tauri-service",
      {
        // The repository to open, passed the way a terminal user would. These
        // are service options, not capabilities: the launcher reads `appArgs`
        // and `env` from here and spawns the binary with them.
        appArgs: [fixture],
        // The harness puts its own flags ahead of `appArgs`, and an environment
        // variable cannot be reordered.
        env: { GITCANVAS_REPOSITORY: fixture },
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",

  // A cold start compiles nothing but does open a window and read a repository.
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  mochaOpts: { ui: "bdd", timeout: 120_000 },

  async before(_capabilities, _specs, browser) {
    // `tsx` loads these spec files through esbuild with `keepNames` hardcoded
    // on, which wraps every named function in a call to `__name(fn, "name")`.
    // That helper is defined in the transpiled Node module, not in what
    // `browser.execute()` serialises and sends to the page, so any spec whose
    // callback assigns a function to a name throws `__name is not defined`
    // before it runs. A no-op `__name` on `window` closes the gap. Passed as
    // a string, not a function, so this call itself is not transpiled and
    // cannot trip the same bug.
    await (browser as WebdriverIO.Browser).execute(
      "window.__name = window.__name || function (fn) { return fn; };",
    );

    // Before every element lookup or click, `@wdio/tauri-service` asks the app
    // which window is active, through `window.__TAURI__`. This application does
    // not expose that global, so each of those checks waited out a five second
    // timeout: every command cost five seconds, and a 20 second `waitUntil` got
    // through two or three iterations. That is what made specs that watch the
    // interface change (local changes, refresh) fail on a first launch and pass
    // on a retry. There is one window, so switching to it explicitly is a no-op
    // that also tells the service not to second-guess the choice.
    const driver = browser as WebdriverIO.Browser;
    const [window] = await driver.getWindowHandles();
    if (window !== undefined) await driver.switchToWindow(window);
  },

  onComplete() {
    // Only remove what this file created; never a repository someone passed in.
    if (providedRepository === undefined) {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  },
};
