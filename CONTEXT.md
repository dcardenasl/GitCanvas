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
content is reported through typed outcomes. Commit diffs compare against the first
parent. Pull is fast-forward only. GitHub credentials are stored in the operating
system keychain and remain inside Rust after entry.

## Session entry points

Read `TASKS.md` for the next open task and its acceptance evidence. Read the referenced
plan before implementing it. `CLAUDE.md` records branch, commit, security, and
verification conventions; `DESIGN.md`, `PRODUCT.md`, and `docs/adr/` describe current
product and architecture decisions. `ARCHIVES.md` records completed tasks.
