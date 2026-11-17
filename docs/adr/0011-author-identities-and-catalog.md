# ADR 0011: Author identities and the author catalog

## Status

Proposed — 2026-11-16. Decisions, bounds, acceptance matrix and task order are in the
[v0.9 implementation plan](../plan/2026-11-16-v0.9-implementacion.md).

## Context

Commits expose `author_name` and `author_email` but nothing groups them. People who commit
under several addresses appear as several authors, and a catalog built from the loaded
history pages would change with scrolling and filters. The roadmap requires a complete,
progressive catalog that never merges people by name, and an emphasis that dims without
hiding or moving anything. The graph keeps one node per commit and a stable layout
([ADR 0007](0007-stable-branch-graph.md)); history reads use frozen roots and cursors tied
to their state ([ADR 0003](0003-scheduling-secrets-and-caches.md)).

## Decision

**Identity.** An author is the pair (name, email) after `.mailmap` resolution through
`Repository::mailmap()` (libgit2, available in the pinned `git2` 0.21). No other merging: not
by name, not by letter case, not by similarity. Two addresses are two authors unless the
repository's own `.mailmap` says otherwise. A `.mailmap` larger than 1 MiB or unreadable is
reported and ignored.

**Catalog.** A dedicated walk over the frozen roots, in chunks of 5,000 commits, with a
cursor bound to those roots, progress, cancellation and a `complete` flag. It is
independent of loaded pages and active filters. The ceiling is two million commits, the
same budget as the history cache; beyond it the result is marked incomplete with the cause.

**Emphasis.** Dimming is a frontend presentation over the identity key. It never removes a
node or an edge and never changes the layout. Previous/next navigation uses a paginated Rust
command because the target commit may lie outside the loaded pages.

## Consequences

Authors are complete and stable regardless of how the user scrolls or filters. People with
several identities show several entries until the repository maps them, which is explicit
rather than guessed. The cost is one extra bounded history walk, cancelable and cached per
roots revision, and one more command pair on the read gate.
