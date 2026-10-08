import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

/** Paths and hand-off token for a fixture owned by this E2E run. */
interface OwnedFixture {
  readonly repository: string;
  readonly token: string;
}

const FIXTURE_ENV = "GITCANVAS_E2E_FIXTURE";
const FIXTURE_TOKEN_ENV = "GITCANVAS_E2E_FIXTURE_TOKEN";
const FIXTURE_OWNER_MARKER = ".git/gitcanvas-e2e-owner";
const FIXTURE_TOKEN_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;

/** Validate a fixture path and its ownership marker without following symlinks. */
function validatedOwnedFixture(
  repository: string,
  token: string,
): OwnedFixture | null {
  if (!FIXTURE_TOKEN_PATTERN.test(token)) {
    return null;
  }

  try {
    const realRepository = fs.realpathSync(repository);
    const realTemp = fs.realpathSync(os.tmpdir());
    const repositoryInfo = fs.lstatSync(repository);
    const relative = path.relative(realTemp, realRepository);
    const gitInfo = fs.lstatSync(path.join(realRepository, ".git"));
    const markerPath = path.join(realRepository, FIXTURE_OWNER_MARKER);
    const markerInfo = fs.lstatSync(markerPath);

    if (
      repositoryInfo.isSymbolicLink() ||
      !repositoryInfo.isDirectory() ||
      !gitInfo.isDirectory() ||
      markerInfo.isSymbolicLink() ||
      !markerInfo.isFile() ||
      markerInfo.size !== token.length ||
      path.dirname(relative) !== "." ||
      !path.basename(relative).startsWith("gitcanvas-e2e-") ||
      fs.readFileSync(markerPath, "utf8") !== token
    ) {
      return null;
    }

    return { repository: realRepository, token };
  } catch {
    return null;
  }
}

/** Reuse only a fixture created by this test run, never an arbitrary env path. */
function inheritedOwnedFixture(): OwnedFixture | null {
  // The main runner inherits the user's environment, so a matching path and
  // marker alone do not prove that this process created the fixture. Only a
  // WDIO child with its private IPC channel may consume the runner's hand-off.
  if (
    process.env.WDIO_WORKER_ID === undefined ||
    typeof process.send !== "function"
  ) {
    return null;
  }

  const repository = process.env[FIXTURE_ENV];
  const token = process.env[FIXTURE_TOKEN_ENV];
  return repository === undefined || token === undefined
    ? null
    : validatedOwnedFixture(repository, token);
}

function removeOwnedFixture(fixture: OwnedFixture): void {
  // The runner owns the fixture directly; this check must not require WDIO's
  // worker-only IPC markers, which are absent in the main process.
  const current = validatedOwnedFixture(fixture.repository, fixture.token);
  if (
    current?.repository === fixture.repository &&
    current.token === fixture.token
  ) {
    fs.rmSync(fixture.repository, { recursive: true, force: true });
  }
}

/** Build a temporary fixture before the app starts, then remove it on failure. */
function createFixtureRepository(
  kind: "history" | "local-changes",
): OwnedFixture {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "gitcanvas-e2e-"));
  const token = randomUUID();
  try {
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repository, ...args], { stdio: "pipe" });

    execFileSync("git", ["init", "-b", "main", repository], { stdio: "pipe" });
    fs.writeFileSync(path.join(repository, FIXTURE_OWNER_MARKER), token, {
      flag: "wx",
      mode: 0o600,
    });
    git("config", "user.email", "e2e@example.com");
    git("config", "user.name", "End To End");

    if (kind === "local-changes") {
      fs.writeFileSync(path.join(repository, "base.txt"), "base\n");
      git("add", "base.txt");
      git("commit", "-m", "base commit");
      return { repository: fs.realpathSync(repository), token };
    }

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

    return { repository: fs.realpathSync(repository), token };
  } catch (error) {
    fs.rmSync(repository, { recursive: true, force: true });
    throw error;
  }
}

/**
 * The repository the application opens.
 *
 * `GITCANVAS_E2E_REPO` points the suite at a real repository, which is how the
 * graph gets exercised against a history nobody wrote for it. Without it, a
 * purpose-built fixture is created and removed afterwards.
 */
const fixtureKind = process.env.GITCANVAS_E2E_FIXTURE_KIND ?? "history";
if (fixtureKind !== "history" && fixtureKind !== "local-changes") {
  throw new Error(`Unsupported E2E fixture kind: ${fixtureKind}`);
}

// local-changes writes files and updates the index. Give that spec its own
// throwaway repository even when the rest of the suite targets a user repo.
const providedRepository =
  fixtureKind === "local-changes" ? undefined : process.env.GITCANVAS_E2E_REPO;

/*
 * This file is evaluated twice: once by the launcher, which starts the
 * application against the fixture, and again inside each spec's worker, because
 * specs import `e2eRepository` from here. Without a hand-off the worker built
 * a second fixture and the spec edited a repository the application was not
 * showing, so every spec that changes the repository saw nothing happen. The
 * launcher publishes its fixture in the environment and the worker reuses it.
 */
const inheritedFixture =
  providedRepository === undefined ? inheritedOwnedFixture() : null;
const ownedFixture =
  providedRepository === undefined
    ? (inheritedFixture ?? createFixtureRepository(fixtureKind))
    : null;
const fixture = providedRepository ?? ownedFixture?.repository;
if (fixture === undefined) {
  throw new Error("Unable to prepare the E2E repository");
}
if (ownedFixture !== null) {
  process.env[FIXTURE_ENV] = ownedFixture.repository;
  process.env[FIXTURE_TOKEN_ENV] = ownedFixture.token;
}
export const e2eRepository = fixture;

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.e2e.json",

  // Keep manual visual captures out of the regression suite; run them by
  // naming their file explicitly with `--spec` when a screenshot is needed.
  specs: ["./e2e/*.spec.ts"],
  maxInstances: 1,

  // Every spec runs in its own WDIO process (see scripts/run-e2e.sh), and the
  // window is selected before the spec starts. Retrying would mask a broken
  // startup or assertion without repairing either race, so each spec runs once.
  specFileRetries: 0,

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
    if (ownedFixture !== null) removeOwnedFixture(ownedFixture);
  },
};
