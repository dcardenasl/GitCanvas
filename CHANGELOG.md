# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
