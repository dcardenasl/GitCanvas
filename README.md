<p align="center">
  <img src="docs/assets/logo.png" alt="GitCanvas" width="96" height="96">
</p>

<h1 align="center">GitCanvas</h1>

<p align="center">
  <strong>Git log is a list. Your history is a shape.</strong><br>
  A free, open-source visual Git client that draws your branches and merges so you can read a repository's history at a glance.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Platforms: macOS, Linux, Windows" src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg">
</p>

<p align="center">
  <img src="docs/assets/demo.gif" alt="GitCanvas drawing a repository's branches and merges as colored lanes, then selecting a merge commit to read its details" width="860">
</p>

## What it is

GitCanvas does one thing: it lets you **see the shape of a repository's history**. Open a
local repository (or clone one from GitHub), scroll the branch graph, click any commit and
read what it changed. It updates as your working tree changes.

- **The graph is the product.** Every branch keeps its color and its lane, merges are drawn
  without detours, and lanes never reorder as you load more history.
- **Reading first.** Inspecting history never changes it. The few actions that do write
  (checkout, fast-forward pull, push) are explicit, protect uncommitted work and never force.
- **Small, fast and free.** Large repositories load 500 commits at a time, nothing is locked
  behind payment and there is no telemetry.

It is deliberately not a full Git client. If you want conflict resolution, interactive
rebase or pull-request workflows, tools like GitKraken, Tower or Fork do far more.
GitCanvas is the opposite trade: focused on reading history well.

## Features

- **Project tabs and session restoration.** Keep independent selections, search and
  navigation across up to thirty projects. Reorder by pointer or keyboard, favorite a
  project and reopen it from the start screen or opening menu. Saved tabs validate on
  first use; missing folders remain recoverable. Only the active project is observed,
  and heavy caches are retained for at most five inactive projects.

- **Branch graph with stable lanes.** Branches and merges are drawn as lanes in SVG, and
  lanes never reorder as you load more history. Branch and tag badges sit on the commits
  they point at, tags first, with overflow folded into a `+N` menu. Named colors stay with
  branches across pages and restarts, configured upstreams share colors, and a chosen
  visual main branch keeps the leftmost lane. Branch menus change a branch's color or
  visual main without a checkout.
- **Fast on large repositories.** History loads 500 commits at a time and the graph layout
  is extended page by page instead of recomputed. Only visible rows are rendered;
  later pages reuse the bounded traversal cache and existing geometry.
- **Commit inspector.** Author, full message, changed files (as a list or a directory
  tree) and a line-numbered diff against the first parent. Binary and oversized files are
  reported instead of rendered.
- **Image preview.** Compare supported PNG, JPEG, GIF, WebP, BMP, ICO and SVG versions in
  commits, file history, local changes and stash. Modified images have side-by-side and
  slider views; non-image binaries keep their existing notice.
- **File history.** Follow a single file across commits and renames, with the diff of each
  commit and the version before a deletion.
- **Stash inspection.** Browse, search and read stashes (all, staged, unstaged and untracked
  changes) in read-only form, with markers on their base commits in the graph.
- **Reference explorer and worktrees.** Search branches and tags in a folder tree, choose
  which references shape the history, and move between linked worktrees in their own tabs.
- **Live local changes.** Staged, unstaged and new files show up as a working-tree row and
  refresh as you edit, without reopening the repository.
- **Search.** Find a commit by message, author or abbreviated hash (`Cmd/Ctrl-F`).
- **GitHub clone.** Sign in with a personal access token, browse your repositories and
  clone one. The token is kept in your operating system's keychain and is only used inside
  the Rust core; it never reaches the interface.
- **Guarded actions.** Checkout refuses when it would lose uncommitted work. Pull is
  fast-forward only. Push always asks first and never forces.
- **Keyboard friendly**, with dark, light and system appearance.
- **No telemetry.** GitCanvas makes no analytics or tracking requests. Its network
  access is Git itself (clone, fetch, pull, push), the GitHub API if you sign in, and
  GitHub Releases when you check for app updates.

> The interface is available in English and Spanish. It follows the system language by
> default and can be switched from the toolbar.

## Latest: 0.8 — images in history

<p align="center">
  <img src="docs/assets/demo-images.gif" alt="GitCanvas 0.8: comparing a changed PNG side by side and with a slider, following it through the file history, then viewing an animated GIF, an SVG and a stashed image" width="720">
</p>

Image files stop being "binary". Commits, file history, local changes and stashes show
supported PNG, JPEG, GIF, WebP, BMP, ICO and SVG files, side by side or with a slider, and
GIFs can be paused. Everything stays read-only. Earlier releases and the full list of changes
are in the [changelog](CHANGELOG.md).

## Install

Download the installer for your system from the
[latest release](https://github.com/dcardenasl/gitcanvas/releases/latest):

| System | Download |
|---|---|
| macOS (Apple Silicon and Intel) | `.dmg` |
| Windows | `.msi` or `-setup.exe` |
| Linux | `.AppImage`, `.deb` or `.rpm` |

GitCanvas is developed mostly on macOS. The release workflow also builds the Linux and
Windows installers, but those have seen much less hands-on use, so bug reports there are
especially welcome.

To check for a newer version, open **Preferences → Check for updates**. GitCanvas verifies
the signed release before offering **Install and restart**. The first release that includes
the updater must be installed manually by existing users; later releases can be installed
from the app.

### First launch: the "unidentified developer" warning

The installers are **not code-signed yet**, so your operating system will warn you the
first time. That warning is about the missing signature, not about anything the app does;
the source is right here and you can build it yourself (see below).

- **macOS:** right-click the app, choose **Open**, then **Open** again. Or clear the
  quarantine flag once:

  ```bash
  xattr -dr com.apple.quarantine /Applications/GitCanvas.app
  ```

- **Windows (SmartScreen):** click **More info**, then **Run anyway**.
- **Linux (AppImage):** make it executable first: `chmod +x GitCanvas_*.AppImage`.

Code signing is planned; the release workflow is structured so it can be added without
restructuring anything.

## Use

Open a repository from the app with **Abrir repositorio**, or from a terminal the way a
Git client should behave:

```bash
# macOS
open -a GitCanvas --args /path/to/repo

# Linux / Windows, with the executable on your PATH
gitcanvas /path/to/repo
```

| Action | What happens |
|---|---|
| Scroll | Loads more history as you reach the end, 500 commits at a time |
| Click a commit | Opens the inspector with its author, message, files and diff |
| ↑ / ↓ | Moves the selection without leaving the keyboard |
| **Pull** | Fetches and fast-forwards. Anything needing a merge is reported, not resolved |
| **Push** | Asks for confirmation first, and never forces |
| Row menu → **History** | Opens the history of a file, following renames |
| **Stashes** (sidebar) | Lists saved stashes; click one to inspect it without changing the graph |
| **GitHub** | Stores a token in the OS keychain, lists your repositories, clones one |

Logs are written to `logs/` under the application data directory (daily JSONL, up to
seven files):

- macOS: `~/Library/Application Support/com.davidcardenas.gitcanvas/logs`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/com.davidcardenas.gitcanvas/logs`
- Windows: `%APPDATA%\com.davidcardenas.gitcanvas\logs`

## Known limitations

Documented on purpose rather than discovered later:

- Diffs are computed **against the first parent only**. Combined diffs for merge commits
  are not supported yet.
- `pull` is **fast-forward only**. Anything that needs a merge is reported, not resolved
  automatically.
- Push is **never forced**.
- Cold topological reads of histories with many loose objects may exceed 300 ms;
  subsequent pages reuse a bounded SHA cache. Git reads run off the UI thread.
- Graph layout is optimised for the common case, not for histories with a very large
  number of simultaneously active branches.
- File history follows renames by similarity (50%) and does not follow copies. Merges are
  compared with their first parent only, and a file's history does not show blame.
- Stashes are **read-only**: you can inspect them, but not create, apply or discard them
  from GitCanvas yet. Stashes do not appear as nodes in the graph, only as markers on
  their base commits.
- Image reads share the existing 2 MiB initial and 32 MiB expanded byte limits and a
  40 megapixel metadata limit. SVG is displayed through an isolated image element without
  parsing or running markup; decoding depends on the system WebView. ICO dimensions use
  the first directory entry. Other unsupported formats remain binary.
- The installers are unsigned (see above) and the interface is available in English and Spanish only.

## Build from source

Requirements:

- Node >= 22
- Rust stable (`rustup`), with the `clippy` and `rustfmt` components
- The platform toolchain for Tauri v2 (Xcode Command Line Tools on macOS; see the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for Linux and Windows)

```bash
npm install
npm run tauri build -- --bundles app   # macOS; omit --bundles to build every installer
```

On macOS the app is written to `target/release/bundle/macos/GitCanvas.app`.

## How it is built

| Layer | Choice |
|---|---|
| Shell | Tauri v2 |
| Git engine | Rust, `git2` (libgit2) with vendored libgit2 and OpenSSL |
| Type contracts | `tauri-specta` — Rust types generate `src/bindings.ts`, never hand-written |
| Graph layout | TypeScript, a pure function with no React, DOM or Tauri dependency |
| Render | SVG over row virtualization (`@tanstack/react-virtual`) |
| Frontend | React + TypeScript + Vite |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the design, [`CHANGELOG.md`](CHANGELOG.md)
for what shipped, and [`TASKS.md`](TASKS.md) for how it was built.

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

The end-to-end suite is `npm run test:e2e:run`; Linux CI runs it under Xvfb, while macOS
and Windows run with their native desktop environment. `npm run test:e2e` also builds the
app before starting the suite.

### Demo video tooling

`tools/demo/` builds the promo videos. It is maintainer-only, outside CI, and you do not need
it to contribute.

## Contributing

Bug reports, ideas and feedback are very welcome — please
[open an issue](https://github.com/dcardenasl/gitcanvas/issues). Pull requests are
considered case by case: open an issue first so we can agree on the change before you
spend time on it. GitCanvas is maintained by one person in spare time, so replies may take
a few days and there is no support SLA.

## Support the project

GitCanvas is free and nothing in the app is locked behind payment. Starring the repo,
reporting bugs and telling a colleague help just as much as anything else.

If it saves you time and you want to help keep it going, you can sponsor the project on
[GitHub Sponsors](https://github.com/sponsors/dcardenasl) — or use the Sponsor button at the top
of this repository. Entirely optional.

## License

[MIT](LICENSE) © 2026 David Cárdenas Lorca.
