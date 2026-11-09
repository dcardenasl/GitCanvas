# GitCanvas Context

## Product and architecture

GitCanvas is a Tauri 2 desktop application for inspecting Git history and working-tree
changes. The Rust `gitcanvas-core` crate owns Git operations and bounded data access;
`src-tauri` exposes typed IPC commands and schedules blocking Git work off the UI
runtime; React and TypeScript render the interface and compute the resumable commit
graph. `src/bindings.ts` is generated from Rust types.

## Live repository observation

The native watcher does not recursively watch project files. It subscribes to Git
metadata paths for the repository and its common directory, and recursively watches
only `refs` directories. It classifies `HEAD`, refs, packed refs and merge-related
metadata as history metadata; index changes invalidate working-tree data. Editors can
change files without changing Git metadata, so the visible UI also polls a bounded
working-tree fingerprint. Healthy watcher state uses a five-second base interval;
degraded state uses two seconds, with adaptive backoff capped at 60 seconds. Polling
invalidates local queries only when the fingerprint changes. The fingerprint is an
opaque revision token, not a durable or cryptographic identifier.

Watcher events are debounced (250 ms settle, at most two seconds). Watch and unwatch
operations use generations so stale asynchronous starts cannot replace or stop the
current watcher. A watcher failure is surfaced as a recoverable degraded state.

## Repository mutation boundary

GitCanvas is read-mostly, not read-only. Its ordinary inspection paths do not stage,
unstage, commit, or delete user files. Explicit Git actions can check out a branch,
fast-forward pull, and push the current branch. Checkout is guarded against losing
local changes and requires a separate explicit force option to discard them; pull does
not merge, and push does not force. GitHub clone creates an application-owned local
copy. Repository commands require a canonical path previously authorized through the
repository-opening, startup, or clone flow; each operation opens its own short-lived
Git handle.

## Resource limits and UI contract

History pages are capped at 500 commits. Worktree snapshots page at most 250 files per
side. Initial file content is capped at 2 MiB and explicit reads at 32 MiB; initial
patches are capped at 1 MiB and explicit patches at 16 MiB. Oversized or omitted
content is reported through typed outcomes. Syntax highlighting is a frontend concern with
its own bounds (5 000 rows, 2 MiB) and falls back to plain text. Commit diffs compare against the first
parent. Pull is fast-forward only. GitHub credentials are stored in the operating
system keychain and remain inside Rust after entry.

## Workspace

Canonical worktree roots identify ordered tabs. Each keeps independent navigation and
Git action state. One watcher and poller follow the verified active root; inactive tabs
perform no periodic reads. Activation reopens and authorizes the root, compares refs and
reuses matching history pages. The target is gated synchronously before effects run;
verification awaits the local fingerprint and the write executor rejects unverified roots.
Heavy query data is retained for the active root and at
most five inactive roots by last activation; closing removes all queries for that root.

The Rust versioned workspace store remembers tabs, active root, durable navigation,
favorites and twenty recents through atomic replacement. Restoration precedes rendering;
only the active tab is validated initially. Stored paths authorize nothing. Missing tabs
remain recoverable; storage errors allow in-memory work with a visible notice. The
frontend serializes saves, debounces navigation and flushes before normal close or quit.
`OpenRepos` protects all open clones, including inactive and unverified tabs, rather than
one active path, including shared Git data used by external worktrees. Pending reports
and unknown dependencies prevent retention, and in-use entries cannot be replaced for
repair. Favorites and recents do not protect clones. See ADR 0006.

## Stable branch graph (v0.4 in dev)

References share one locally stable snapshot, including upstreams and symbolic targets.
History pages use frozen roots; obsolete frontend walks are released when roots change.
The pure layout preserves pending trajectories until their actual target node, follows
first parents, and reserves the left lane for a visual principal independent of HEAD.
Semantic colors are shared by configured upstream groups, never derived from lanes.
Schema 2 migrates schema 1 and retains graph preferences per canonical worktree after
its tab closes. Automatic reconciliation cannot overwrite a later explicit edit.
See ADR 0007 and docs/verification/v0.4.md for evidence and external gates.

## File history (v0.6 in dev)

A file's history is a view of one repository path from one start commit, opened from the
commit inspector (start = that commit) or from the local changes list (start = HEAD). It
replaces the graph while it is open and is kept only for the session, never written to
disk. Its query is immutable per start commit, so a refresh from a moved HEAD is a new
query. Opening it never changes the graph's reference filters.

## Stash inspection (v0.7 implemented in dev)

Read-only stash listing and saved-state inspection are implemented from core through
IPC and UI. It reads a bounded shared reflog without creating it;
search covers the complete snapshot, and cursors bind repository, revision, search
and position. Saved OIDs are stable identities; reflog indexes are display aliases.
Git and libgit2 serve as integration-test oracles only. Product decisions, remaining
contracts and task dependencies are recorded in
[the v0.7 plan](docs/plan/2026-11-08-v0.7-implementacion.md) and
[ADR 0009](docs/adr/0009-read-only-stash.md). Stashes remain outside graph roots
and filter state. Listing uses the shared repository reflog, while inspection state
is per tab and session-only; only section folding is durable. Comparisons
are net/base, saved index, saved worktree after index, and saved untracked content.
Saved comparisons use exact origin/delta keys and shared header-bounded blob readers.
Content and patch limits also cover UTF-8 replacement expansion. Comparison work is
bounded to 64 MiB of unique readable blobs; oversized files keep metadata and exact
rename pairing with an explicit notice. Linux/Windows native verification and a real
screen-reader pass remain open. Evidence and platform limits are recorded in
`docs/verification/v0.7.md`.

## Session entry points

Read `TASKS.md` for the next open task and its acceptance evidence. Read the referenced
plan before implementing it. `CLAUDE.md` records branch, commit, security, and
verification conventions; `DESIGN.md`, `PRODUCT.md`, and `docs/adr/` describe current
product and architecture decisions. `ARCHIVES.md` records completed tasks.
