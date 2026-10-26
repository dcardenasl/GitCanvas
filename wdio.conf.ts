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
function inheritedOwnedFixture(
  repositoryEnv = FIXTURE_ENV,
  tokenEnv = FIXTURE_TOKEN_ENV,
): OwnedFixture | null {
  // The main runner inherits the user's environment, so a matching path and
  // marker alone do not prove that this process created the fixture. Only a
  // WDIO child with its private IPC channel may consume the runner's hand-off.
  if (
    process.env.WDIO_WORKER_ID === undefined ||
    typeof process.send !== "function"
  ) {
    return null;
  }

  const repository = process.env[repositoryEnv];
  const token = process.env[tokenEnv];
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
  kind: "history" | "local-changes" | "workspace" | "graph-performance",
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

    if (kind === "graph-performance") {
      const stream: string[] = [];
      for (let index = 1; index <= 10_000; index += 1) {
        const message = `history commit ${String(index)}\n`;
        stream.push(
          `commit refs/heads/main\nmark :${String(index)}\ncommitter End To End <e2e@example.com> ${String(1_000_000_000 + index)} +0000\ndata ${String(Buffer.byteLength(message))}\n${message}${index > 1 ? `from :${String(index - 1)}\n` : ""}\n`,
        );
      }
      for (let index = 1; index <= 11; index += 1) {
        const message = `branch tip ${String(index)}\n`;
        stream.push(
          `commit refs/heads/branch-${String(index).padStart(2, "0")}\ncommitter End To End <e2e@example.com> ${String(1_000_020_000 + index)} +0000\ndata ${String(Buffer.byteLength(message))}\n${message}from :8000\n\n`,
        );
      }
      execFileSync("git", ["-C", repository, "fast-import", "--quiet"], {
        input: stream.join(""),
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { repository: fs.realpathSync(repository), token };
    }

    if (kind === "local-changes" || kind === "workspace") {
      fs.writeFileSync(path.join(repository, "base.txt"), "base\n");
      git("add", "base.txt");
      git(
        "commit",
        "-m",
        kind === "workspace" ? "workspace alpha commit" : "base commit",
      );
      if (kind === "workspace")
        fs.writeFileSync(
          path.join(repository, "alpha-local.txt"),
          "alpha only\n",
        );
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
    git("tag", "-a", "side-snapshot", "side", "-m", "side snapshot");
    fs.writeFileSync(path.join(repository, "local-only.txt"), "working copy\n");

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
if (
  fixtureKind !== "history" &&
  fixtureKind !== "local-changes" &&
  fixtureKind !== "workspace" &&
  fixtureKind !== "graph-performance"
) {
  throw new Error(`Unsupported E2E fixture kind: ${fixtureKind}`);
}

// local-changes writes files and updates the index. Give that spec its own
// throwaway repository even when the rest of the suite targets a user repo.
const providedRepository =
  fixtureKind === "history" ? process.env.GITCANVAS_E2E_REPO : undefined;

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

// The default history fixture also has one real linked worktree. Create it only
// in the launcher process and only for a repository this run owns; a supplied
// repository is never modified. Its deterministic sibling path is unique to
// the UUID-scoped fixture and is removed alongside that fixture below.
const linkedFixtureWorktree =
  fixtureKind === "history" && ownedFixture !== null
    ? `${ownedFixture.repository}-linked`
    : null;
if (
  linkedFixtureWorktree !== null &&
  inheritedFixture === null &&
  process.env.WDIO_WORKER_ID === undefined
) {
  execFileSync(
    "git",
    ["-C", fixture, "worktree", "add", linkedFixtureWorktree, "side"],
    { stdio: "pipe" },
  );
}

// A second owned repository is handed to the worker through the same validated
// ownership protocol. Both repositories and the data directory are disposable.
const SECOND_FIXTURE_ENV = "GITCANVAS_E2E_SECOND_FIXTURE";
const SECOND_TOKEN_ENV = "GITCANVAS_E2E_SECOND_TOKEN";
const inheritedSecond =
  fixtureKind === "workspace"
    ? inheritedOwnedFixture(SECOND_FIXTURE_ENV, SECOND_TOKEN_ENV)
    : null;
const secondFixture =
  fixtureKind === "workspace"
    ? (inheritedSecond ?? createFixtureRepository("local-changes"))
    : null;
if (secondFixture !== null) {
  if (inheritedSecond === null) {
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", secondFixture.repository, ...args], {
        stdio: "pipe",
      });
    fs.writeFileSync(
      path.join(secondFixture.repository, "beta.txt"),
      "beta committed\n",
    );
    git("add", "beta.txt");
    git("commit", "-m", "workspace beta commit");
    fs.writeFileSync(
      path.join(secondFixture.repository, "beta-local.txt"),
      "beta only\n",
    );
  }
  process.env[SECOND_FIXTURE_ENV] = secondFixture.repository;
  process.env[SECOND_TOKEN_ENV] = secondFixture.token;
}
export const e2eSecondRepository = secondFixture?.repository ?? null;

/**
 * Where the application keeps its data for this run.
 *
 * The application restores its workspace from this directory and writes to it,
 * so a run against the real one would open the tester's own tabs and overwrite
 * them. A directory named after the fixture is the same in the launcher and in
 * every worker without a second hand-off, and unique per run for an owned
 * fixture. Only the launcher clears it: a worker evaluating this file after the
 * application started must not wipe what the application already wrote.
 */
/**
 * A path the way the application names it. The application canonicalizes every
 * project root, and on Windows that is the extended-length form (`\\?\C:\…`)
 * with short 8.3 names expanded, which is not what `fs.realpathSync` returns.
 * A tab restored under any other spelling is refused because its project now
 * "resolves to" a different path, so the seeded workspace must use this form.
 */
function canonicalForApplication(location: string): string {
  const native = fs.realpathSync.native(location);
  return process.platform === "win32" && !native.startsWith("\\\\?\\")
    ? `\\\\?\\${native}`
    : native;
}

/** The fixture repository's root as the application stores it. */
export const e2eRepositoryRoot = canonicalForApplication(fixture);

export const e2eDataDir = path.join(
  os.tmpdir(),
  `gitcanvas-e2e-data-${path.basename(fixture)}`,
);
if (process.env.WDIO_WORKER_ID === undefined) {
  fs.rmSync(e2eDataDir, { recursive: true, force: true });
  if (secondFixture !== null) {
    const restoredRoot = e2eRepositoryRoot;
    fs.mkdirSync(e2eDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(e2eDataDir, "workspace.json"),
      JSON.stringify({
        version: 1,
        workspace: {
          tabs: Array.from({ length: 30 }, (_, index) => ({
            path:
              index === 0
                ? restoredRoot
                : path.join(
                    restoredRoot,
                    `remembered-tab-${String(index).padStart(2, "0")}`,
                  ),
            selection: { kind: "history" },
            history_anchor: null,
            collapsed_folders: [],
          })),
          active: restoredRoot,
          favorites: Array.from({ length: 199 }, (_, index) =>
            path.join(
              restoredRoot,
              `remembered-${String(index).padStart(3, "0")}`,
            ),
          ),
          recents: [secondFixture.repository],
        },
      }),
    );
  }
}

let activeBrowser: WebdriverIO.Browser | null = null;

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
        env: {
          GITCANVAS_REPOSITORY: fixture,
          GITCANVAS_DATA_DIR: e2eDataDir,
        },
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
    const [windowHandle] = await driver.getWindowHandles();
    if (windowHandle !== undefined) await driver.switchToWindow(windowHandle);
    activeBrowser = driver;
    await driver.execute(() => {
      const errors: string[] = [];
      Object.assign(window, { __gitcanvasE2EErrors: errors });
      const record = (message: string) => {
        if (errors.length < 50) errors.push(message);
      };
      window.addEventListener("error", (event) => {
        record(event.message);
      });
      window.addEventListener("unhandledrejection", (event) => {
        const cause: unknown = event.reason;
        record(String(cause));
      });
      for (const level of ["error", "warn"] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
          record(args.map(String).join(" "));
          original(...args);
        };
      }
    });

    // The application starts in the language of the machine it runs on, and the
    // specs select by that language's text. Choosing it through the interface,
    // by selectors that do not depend on any language, makes every run read the
    // same screen on Linux, macOS and Windows alike.
    const preferences = await driver.$(".preferences-menu__toggle");
    await preferences.waitForExist({ timeout: 20_000 });
    await preferences.click();
    // Set through the page rather than by clicking the option: the options of a
    // native select open in a popup that WebView2, WebKit and WebKitGTK each
    // drive differently, and the change event is all the application listens to.
    await driver.execute(() => {
      const select = document.querySelector<HTMLSelectElement>(
        ".language-selector__select",
      );
      if (select === null) throw new Error("Language selector is missing");
      select.value = "es";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await driver.waitUntil(
      async () => (await driver.$("html").getAttribute("lang")) === "es",
      { timeoutMsg: "expected the interface to switch to Spanish" },
    );
    await preferences.click();
  },

  async after() {
    if (activeBrowser === null) return;
    const health = await activeBrowser.execute(() => {
      const captured: unknown = Reflect.get(window, "__gitcanvasE2EErrors");
      if (!Array.isArray(captured))
        throw new Error("Renderer error capture is missing");
      return {
        title: document.title,
        content: document.querySelector(".app-shell") !== null,
        overlay: document.querySelector("vite-error-overlay") !== null,
        errors: captured.map((message: unknown) => String(message)),
      };
    });
    if (
      !health.title.includes("GitCanvas") ||
      !health.content ||
      health.overlay ||
      health.errors.length > 0
    ) {
      throw new Error(
        `Application health check failed: ${JSON.stringify(health)}`,
      );
    }
  },

  onComplete() {
    // Only remove what this file created; never a repository someone passed in.
    if (linkedFixtureWorktree !== null && ownedFixture !== null) {
      const current = validatedOwnedFixture(
        ownedFixture.repository,
        ownedFixture.token,
      );
      if (current?.repository === ownedFixture.repository) {
        try {
          execFileSync(
            "git",
            [
              "-C",
              current.repository,
              "worktree",
              "remove",
              "--force",
              linkedFixtureWorktree,
            ],
            { stdio: "pipe" },
          );
        } catch {
          // Removing the owned fixture below also removes its worktree files.
        }
        fs.rmSync(linkedFixtureWorktree, { recursive: true, force: true });
      }
    }
    if (ownedFixture !== null) removeOwnedFixture(ownedFixture);
    if (secondFixture !== null) removeOwnedFixture(secondFixture);
    fs.rmSync(e2eDataDir, { recursive: true, force: true });
  },
};
