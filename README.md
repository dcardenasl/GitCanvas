# GitCanvas

A visual Git client focused on one thing: reading the branch and commit graph of a
repository at a glance. Open a local repository (or clone one from GitHub) and walk
its history branch by branch.

GitCanvas does not try to replace a full Git client. It solves the part that carries
the most value — seeing the shape of the history — and solves it well.

## Status

**v0.1.0** — the MVP is complete: local history with a resumable commit graph,
commit diffs, GitHub cloning, and guarded checkout, pull and push.

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

There are no published installers yet — the first release is still an open pull
request. Until then, build it yourself:

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

Logs are written to `~/Library/Application Support/gitcanvas/logs` on macOS.

## Requirements

- Node >= 22
- Rust stable (`rustup`), with the `clippy` and `rustfmt` components
- Platform toolchain for Tauri v2 (Xcode Command Line Tools on macOS)

## Development

```bash
npm install          # also installs the git hooks via the prepare script
npm run tauri dev    # run the app
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest
cargo test           # Rust unit and integration tests
cargo clippy --all-targets -- -D warnings
```

## Product walkthrough video

Generate a narrated MP4 walkthrough of the desktop app with a temporary
Atlas Storefront repository, meaningful branch history, and a live commit:

```bash
GITCANVAS_VIDEO_LANGUAGE=es npm run record:demo
GITCANVAS_VIDEO_LANGUAGE=en npm run record:demo
npm run record:demo:vertical
```

The output defaults to `../../bitacora-engine/registry/projects/gitcanvas-output/`
as `atlas-storefront-walkthrough-es.mp4` and
`atlas-storefront-walkthrough-en.mp4`. Set `GITCANVAS_RECORDING_OUTPUT` to
choose another path. Install the `edge-tts` command or set `EDGE_TTS_COMMAND` to
its executable path. Narration uses the neural Chilean Spanish voice
`es-CL-CatalinaNeural` and conversational US English voice `en-US-EmmaNeural`,
with short pauses between sections. The vertical command reframes the English
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
