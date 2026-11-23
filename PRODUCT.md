# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

React runs inside a Tauri desktop window on macOS, Linux and Windows.

## Users

David uses local Git repositories and GitHub repositories to inspect branching history.

## Product Purpose

Read the shape of repository history at a glance, then inspect the changes in a commit.

## Capabilities and Constraints

The governing scope is TASKS.md: local history, a resumable graph, first-parent diffs,
working-tree snapshots and diffs, stable branch trajectories/colors and a configurable
visual main branch (v0.4), ordered project tabs with independent navigation,
lazy session restoration, favorites, recent projects, GitHub cloning, guarded checkout, fast-forward pull,
and authenticated push. Git data comes from local repositories and full clones; shallow
clones are not used. Credentials stay in Rust and the OS keychain. The product is
read-mostly, not strictly read-only: explicit checkout, pull and push mutate Git state;
inspection does not stage, unstage, commit or delete user files. Per-file history (v0.6)
is read-only inspection of one path: it follows renames and shows the change in each
commit. Stash inspection (v0.7) lists saved states and compares the base, saved
index, saved worktree and saved untracked files with bounded content and diffs. It never
applies, creates or deletes a stash, and never changes the graph. Linked worktrees share
the stash inventory; inspection context is per tab and session-only, while section
folding is durable. Each unique stash object is associated with its first-parent base
commit on loaded graph rows using an Orchid count and a bounded accessible picker;
the association does not add graph nodes or change selection, filters or paging.

Image preview (v0.8) compares supported image versions in commits, per-file
history, staged/unstaged changes and stash. It reads exact bytes from each source, keeps
non-image binaries on the existing notice, and never writes repository data. Formats are
PNG, JPEG, GIF, WebP, BMP, ICO and SVG. Reads share the 2 MiB initial / 32 MiB expanded
limits and a 40 MP metadata ceiling; the platform WebView determines final decoding.
See ADR 0010 and `docs/verification/v0.8.md`.

Author inspection (v0.9) resolves identities through the repository's `.mailmap`, builds
a bounded progressive author catalog, and navigates to that author's commits even when
they are outside the loaded graph pages. Emphasis dims other known authors without
removing commits or changing graph geometry. GitHub releases are listed separately from
Git references; bounded notes render as Markdown, while HTTPS links open in the system
browser only after explicit activation and native validation. Raw HTML and remote images
remain inactive. Local tags are joined by the backend, and release metadata has its own
bounded offline cache. Fetching a tag and downloading an asset are explicit actions. Asset
IDs and metadata are resolved by Rust, and the native save dialog chooses the destination.
See ADR 0011, ADR 0012, ADR 0015 and `docs/verification/v0.9.md`.

Release/tag operations require an HTTPS GitHub remote. SSH and other providers are not
supported in v0.9. Releases never create graph nodes, references or navigation state.

## Brand Commitments

The user requested execution of the existing plan, whose design is already closed.
The application window inside docs/mockup.html is the visual authority. Preserve its
branch sidebar, graph and commit rows, detail inspector and compact toolbar. The
surrounding mockup presentation page is not part of the application.

## Evidence on Hand

TASKS.md, CLAUDE.md, docs/PLAN-DESARROLLO.md, docs/mockup.html and local reference
repositories identified in CLAUDE.md. Display repository content only from real data.

## Product Principles

- The graph is the central task surface.
- Projects keep independent navigation; only the active project is observed. Missing
  folders stay recoverable and storage failures remain visible without losing in-memory work.
- Loading another page preserves previous lane assignments.
- The interface language is window-level, persisted locally, and follows the operating
  system (Spanish on a Spanish system, English otherwise) unless the user picks one.
  Git data, paths and backend diagnostics are never translated.
- Errors provide a recoverable state; checkout that may discard local changes requires
  explicit confirmation. Pull is fast-forward only and push never forces.
- Keep expensive work off the desktop event loop and bound rendered content.
