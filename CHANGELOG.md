# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Choose dark, light or system appearance.** The window-level preference is
  saved locally, defaults to dark and follows operating-system changes when
  system appearance is selected.
- **Browse changed files as paths or a directory tree.** Commit and working-tree
  panels share the same view switcher; commit trees can include unchanged files
  and load directory contents in bounded pages while retaining change status.
- **Local changes are a bounded, live view.** Staged and unstaged changes plus
  new non-ignored project files share one revisioned snapshot, paginated
  summaries and on-demand diffs and contents. Native observation listens only
  to Git metadata, protected by generation tokens and backed by a visible
  fingerprint fallback, so ignored files cannot degrade the repository view.
- **Local reads are confined and typed.** Traversal and external symlinks are
  rejected, disk reads use a stable stat/read/stat policy, and binary, UTF-8,
  stale-read and resource-limit outcomes cross IPC as explicit errors.

### Fixed

- **Push confirmation** — the dialog now names the checked-out branch instead of the
  repository folder, and Push stays disabled on a detached HEAD.
- **`clone_github_repository`** — every repository now gets its own cache entry
  (`owner__name`), so two names that differed only by a separator no longer share a
  folder and serve the wrong history. A cached entry cloned from another remote is
  replaced, clones land atomically, and only `https://github.com` URLs that match the
  repository are accepted.
- **`pull_fast_forward`** — the working tree is updated before the branch moves, so a
  pull that local changes block leaves everything as it was, and it follows the branch
  the local one actually tracks instead of assuming both share a name.
- **`push_current_branch`** — a push the remote refused is no longer reported as
  pushed: the remote's tip is compared first and any per-ref rejection becomes an
  outcome or an error. A branch pushes to the name it tracks.
- **GitHub token** — offered only to `https://github.com`, once per kind, so a remote
  on another host never receives it and a rejected token cannot loop.
- **Content security policy** — the window now ships a strict CSP (no inline or remote
  scripts, only the IPC bridge as a network target), and the GitHub API address can no
  longer be redirected through an environment variable.
- **`Too many open files`** — reported as a typed `ResourceExhausted` error and retried
  from one place, instead of four copies matching on message text.
- **Git operation scheduling** — pushes, pulls and clones no longer share a gate with
  history reads, so a slow network operation cannot freeze the window, and only
  idempotent reads are retried.
- **`get_commits`** — the ordered history is cached up to 2,000,000 commits (it was
  100,000), so paging through a large repository slices a list instead of repeating
  libgit2's full traversal for every page.
- **History graph** — the layout is computed once and extended page by page (it was
  recomputed from the first commit twice per page), so scrolling deep into a large
  repository stays smooth.
- **Local-changes polling** — the wait between fingerprint reads scales with how long
  the last one took, so a very large working tree no longer keeps the machine busy
  checking it every five seconds. The watcher status also follows the repository it
  belongs to instead of carrying over from the previous one.
- **`get_worktree_snapshot`** — pagination cursors are bound to the revision they were
  read from and are refused as stale once the changes move on.
- **Local changes over 250 files** — the inspector listed only the first page and
  counted only what it had loaded. It now shows the real totals and loads the rest on
  request.

### Changed

- **Live repository reads and watchers.** Transient `Too many open files` errors
  retry with backoff, macOS's low Finder-launched descriptor limit is raised when
  permitted, concurrent Git operations are bounded, and degraded watcher recovery
  backs off to prevent resource exhaustion.

## [0.1.0] — 2026-09-08

### Added

- **Read a file in full, not only what changed.** The centre panel switches
  between the patch and the file as it stands at that commit, with the same
  binary and size guards. A commit that deleted the file does not offer it.
- **Numbered diff lines.** Both revisions are numbered from the hunk headers,
  so the numbers are the file's rather than the row's position on screen, and
  long lines can be wrapped instead of scrolled.
- **Copy from the commit list.** Right-click a commit to copy its short hash,
  full hash, message or author.
- **The sidebar steps aside while a file is open**, giving its width to the
  code; a toolbar control brings it back.
- **Commit search.** Find a commit by message, author or abbreviated hash from
  the toolbar or with Cmd-F; Enter walks the matches and the count says how
  many there are. It searches the history already loaded, and says so rather
  than implying it searched the repository.
- **Branch and tag badges.** Every commit a ref points at carries it on the
  row, with the checked-out branch in the accent colour, so where the branches
  are is visible in the graph instead of only in the sidebar.
- **Resizable panels.** Drag or arrow-key the dividers to set the sidebar and
  inspector widths; they are remembered between sessions and never let the
  history shrink below what a commit message needs.
- **File-by-file diffs.** Selecting a commit lists the files it changed in the
  inspector; choosing one opens its diff across the whole centre panel, where a
  unified patch has room to read. Escape or the back control returns to the
  graph.
- **Sidebar navigation.** Branches and tags are now controls: choosing one
  selects the commit it points at and scrolls the history there, loading more
  pages if that commit has not been reached yet. A tag resolves to its commit
  rather than to the tag object.
- **Branch actions.** Check out a branch, pull, and push from the toolbar.
  Checkout refuses when uncommitted work would be lost and names the files at
  risk; discarding them takes a separate, explicit confirmation. Push always
  asks first.
- **Open a repository from the command line.** `gitcanvas /path/to/repo` opens
  straight into that repository.
- **GitHub integration.** Sign in with a personal access token, browse the
  repositories it can reach, and clone one into an application-owned cache with
  live transfer progress. Clones are always complete: a truncated history would
  make the graph convincing and wrong.
- **Credentials stay in the operating system keychain.** The token is verified
  before it is stored, is used only inside the Rust engine, and never crosses
  the IPC boundary — the interface can ask whether one exists, never what it is.
- **Bounded clone cache.** Ten repositories or five gigabytes, whichever comes
  first, evicting the least recently used and never the one just opened.
- **Commit inspector.** Selecting a commit shows its author, full message and
  changed files, with a line-by-line diff against the first parent.

- **Diff guards.** Binary files and diffs beyond 2000 lines are reported as
  such instead of being rendered, and an oversized diff loads only when asked
  for, so a generated bundle cannot stall the view.
- **Commit graph.** The history view draws branch lanes and merge curves in SVG
  over a virtualized commit table, sharing one scroll container so the graph can
  never drift out of step with its rows. Lane colours are a deterministic
  function of lane index, so they never change between renders.
- **Resumable graph layout.** `layout(commits, previousState)` extends a
  topologically ordered stream without rewriting earlier rows, so loading the
  next page of history leaves the lanes already on screen exactly where they
  were.
- **Cursor-paginated history.** The view loads 500 commits at a time and
  requests the next page as the tail comes into view, so a repository with a
  hundred thousand commits opens as fast as one with fifty.
- **Repository navigation.** A native folder picker opens a local repository,
  and the sidebar lists local branches, remote branches and tags, marking the
  checked-out branch.
- **Git data engine** — Open canonical working repositories, including linked worktrees, and browse topological history with stable cursor pagination, local/remote branches and annotated tags.
- **Repository diagnostics** — Structured errors and rotating JSON logs report failures while Git operations run outside the UI thread.

### Fixed

- **The window keeps up with the repository.** Commits, branches and tags made
  anywhere else now appear without reopening: the repository's metadata is
  watched, coming back to the window re-reads it, and a refresh control covers
  the cases where a watch cannot be established.

- **The system folder panel is pre-initialised at startup**, so the first
  "open repository" no longer pays for AppKit loading its frameworks while the
  interface cannot repaint.
- **Opening a repository shows it is working.** The button now reports the wait
  while the system's folder panel comes up, cannot be clicked into opening a
  second one, and starts in the directory it last opened.

- **The history no longer reflows when a commit is selected.** The inspector
  column is reserved from the start, so choosing a commit stops shrinking the
  list by 310px and redrawing the graph under the cursor that just clicked.
- **File paths read at any width.** The list leads with the file name and
  follows with a dimmed directory, instead of truncating the path from the left
  and running a half-cut directory into the name.
- **The window says which repository it is showing**, so two of them are
  tellable apart.
- **Commit rows read properly to a screen reader.** Each row is named
  explicitly instead of leaving the browser to concatenate its cells, which ran
  the hash straight into the date.
- **Commit rows no longer sit under the graph.** Rows were drawn from the
  window's left edge, so the lane lines overlapped the first characters of the
  message; rows now start past the graph column's width.
- **Collapsing a panel no longer misaligns the layout.** A hidden sidebar or
  inspector kept its grid column instead of closing it up, so the panels next
  to it drifted out of step with the columns they were assigned.
- **Neutral Spanish across the interface.** Copy written with Argentine voseo
  ("Abrí un repositorio") now reads in the neutral form ("Abre un
  repositorio").

### Known limitations

- **Merge diffs cover the first parent only.** A combined diff is a materially
  harder problem and is out of scope for this release; the inspector says so
  explicitly whenever it is showing one.
- **Pull is fast-forward only.** Anything that needs a real merge is reported
  with both branch names, not resolved automatically — creating a merge commit
  from a button has correctness implications that deserve a deliberate decision.
- **Push is never forced.** A rejected non-fast-forward push is explained, never
  retried with force: the remote having commits the local branch does not is
  exactly the case where forcing destroys someone else's work.
