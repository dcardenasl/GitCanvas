# GitCanvas

A visual Git client focused on one thing: reading the branch and commit graph of a
repository at a glance. Open a local repository (or clone one from GitHub) and walk
its history branch by branch.

GitCanvas does not try to replace a full Git client. It solves the part that carries
the most value — seeing the shape of the history — and solves it well.

## Status

**v0.1.0 release pending.** The MVP is implemented and in post-audit hardening;
[the release PR is open](https://github.com/dcardenasl/gitcanvas/pull/1), but merge
approval, the release tag and published installers are still pending. Its last recorded
quality run failed before any steps were recorded;
[the run has no available logs](https://github.com/dcardenasl/gitcanvas/actions/runs/36265828914).

See [`CHANGELOG.md`](CHANGELOG.md) for what shipped, [`TASKS.md`](TASKS.md) for
how it was built, and
[`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md)
for the governing plan.

## Stack

| Layer | Choice |
|---|---|
| Shell | Tauri v2 |
| Git engine | Rust, `git2` (libgit2) with vendored libgit2 and OpenSSL |
| Type contracts | `tauri-specta` — Rust types generate `src/bindings.ts`, never hand-written |
| Graph layout | TypeScript, a pure function with no React, DOM or Tauri dependency |
| Render | SVG over row virtualization (`@tanstack/react-virtual`) |
| Frontend | React + TypeScript + Vite |

## Install

There are no published installers yet. To build locally:

```bash
npm install
npm run tauri build -- --bundles app
cp -R target/release/bundle/macos/GitCanvas.app /Applications/
```

The first launch is blocked by Gatekeeper, because the build is unsigned. Right
click the app and choose Open, or clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/GitCanvas.app
```

Code signing is out of scope for this release; the release workflow is
structured so it can be added without restructuring anything.

## Use

Open a repository in either of two ways:

```bash
# from a terminal, the way a Git client should behave
open -a GitCanvas --args /path/to/repo
```

or launch the app and press **Abrir repositorio**.

| Action | What happens |
|---|---|
| Scroll | Loads more history as you reach the end, 500 commits at a time |
| Click a commit | Opens the inspector with its author, message and diff |
| ↑ / ↓ | Moves the selection without leaving the keyboard |
| **Pull** | Fetches and fast-forwards. Anything needing a merge is reported, not resolved |
| **Push** | Asks for confirmation first, and never forces |
| **GitHub** | Stores a token in the OS keychain, lists your repositories, clones one |

Logs are written below Tauri's application data directory, in `logs/` (daily JSONL,
up to seven files):

- macOS: `~/Library/Application Support/com.davidcardenas.gitcanvas/logs`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/com.davidcardenas.gitcanvas/logs`
- Windows: `%APPDATA%\\com.davidcardenas.gitcanvas\\logs`

## Requirements

- Node >= 22
- Rust stable (`rustup`), with the `clippy` and `rustfmt` components
- Platform toolchain for Tauri v2 (Xcode Command Line Tools on macOS)

## Development

```bash
npm install          # also installs the git hooks via the prepare script
npm run tauri dev    # run the app
npm run typecheck    # tsc --noEmit
npm run typecheck:e2e
npm run typecheck:node
npm run lint         # eslint
npm run format:check
npm run test:coverage
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --workspace
npm run tauri build -- --ci
```

The end-to-end suite is `npm run test:e2e:run`; Linux CI runs it under Xvfb, while
macOS and Windows run with their native desktop environment. `npm run test:e2e` also
builds the app before starting the suite.

## Product walkthrough video

Generate a narrated MP4 walkthrough of the desktop app with a temporary
Atlas Storefront repository, meaningful branch history, and a live commit:

```bash
GITCANVAS_VIDEO_LANGUAGE=es npm run record:demo
GITCANVAS_VIDEO_LANGUAGE=en npm run record:demo
npm run record:demo:vertical
```

Both commands write to `../../bitacora-engine/registry/projects/gitcanvas-output/`
by default. Set `GITCANVAS_VIDEO_DIR` to choose another output directory for
both the landscape and vertical videos. The vertical command expects the English
landscape video in that directory.

The demo tools live in `tools/demo/` and are intentionally excluded from the
application's CI, lint, and TypeScript checks. They require a sibling checkout
of `bitacora-engine` at `../../bitacora-engine`, with its WebDriver capture
adapter available. Install the `edge-tts` command or set `EDGE_TTS_COMMAND` to
its executable path; narration synthesis requires network access. Narration uses
the neural Chilean Spanish voice
`es-CL-CatalinaNeural` and conversational US English voice `en-US-EmmaNeural`,
with short pauses between sections. Both commands require `ffmpeg` and
`ffprobe`; the vertical command also requires ImageMagick's `magick` executable.
The vertical composition uses the macOS Arial font at
`/System/Library/Fonts/Supplemental/Arial.ttf`. The vertical command reframes the English
video to 9:16, holds the centered GitCanvas logo at the opening, zooms from a
laptop view into the app, and zooms back out to the laptop at the end. Between
those bookends it follows the pointer between focused views of the history,
local changes, refresh, and commit details. This uses the WebDriver capture
adapter from `bitacora-engine`; Chrome-based recordings keep using the existing
Puppeteer recorder.

## Known limitations

Documented on purpose rather than discovered later:

- Diffs are computed **against the first parent only**. Combined diffs for merge
  commits are out of scope for the MVP.
- `pull` is **fast-forward only**. Anything that needs a merge is reported, not
  resolved automatically.
- Cold topological reads of histories with many loose objects may exceed 300 ms;
  subsequent pages reuse a bounded SHA cache. Git reads run off the UI thread.
- Graph layout is optimised for the common case, not for histories with a very large
  number of simultaneously active branches.

## Contributing

This is a personal tool and is not open for contributions.

## License

**All rights reserved.** © 2026 David Cárdenas Lorca. Personal use only; no license
to use, copy, modify or distribute is granted.
