# ADR 0011: Author identities and the author catalog

## Status

Proposed — 2026-11-16. Reviewed by the Architect the same day. Decisions, bounds, acceptance
matrix and task order are in the
[v0.9 implementation plan](../plan/2026-11-16-v0.9-implementacion.md).

## Context

Commits expose `author_name` and `author_email` but nothing groups them. People who commit
under several addresses appear as several authors, and a catalog built from the loaded
history pages would change with scrolling and filters. The roadmap requires a complete,
progressive catalog that never merges people by name, and an emphasis that dims without
hiding or moving anything. The graph keeps one node per commit and a stable layout
([ADR 0007](0007-stable-branch-graph.md)); history reads use frozen roots and cursors tied
to their state ([ADR 0003](0003-scheduling-secrets-and-caches.md)). Above the two-million
commit budget the history reader repeats the whole traversal on every page, so chunking a
walk beyond that budget would be quadratic.

## Decision

**Identity.** An author is the pair (name, email) after `.mailmap` resolution. No other
merging: not by name, not by letter case, not by similarity. Two addresses are two authors
unless the repository's own `.mailmap` says otherwise.

**`.mailmap` source.** Rust reads the working-tree `.mailmap` (or `HEAD:.mailmap` when there
is none), checks the 1 MiB ceiling before reading, and builds the map with
`Mailmap::from_buffer`. The `mailmap.file` and `mailmap.blob` configuration keys are not
used, so no arbitrary path is read. A hash of the effective content is part of the cursor
scope: if the file changes, the cursor is stale.

**Catalog.** A dedicated walk through the existing `HistoryReader`, in delta chunks of 5,000
commits, with progress, cancellation between chunks and a `complete` flag. It is
independent of loaded pages and active filters. Beyond two million commits it answers at
once with `complete = false` and the cause `history_too_large` instead of chunking. A hard
ceiling of 100,000 distinct identities answers `too_many_authors`.

**Emphasis.** Dimming is a frontend presentation over the identity key. It never removes a
node or an edge and never changes the layout. Previous/next navigation uses a paginated Rust
command cached by (roots, `.mailmap` hash, author), because the target commit may lie
outside the loaded pages.

## Consequences

Authors are complete and stable regardless of how the user scrolls or filters. People with
several identities show several entries until the repository maps them, which is explicit
rather than guessed. The cost is one extra bounded history walk and one more command pair on
the read gate. Uncommitted edits to `.mailmap` apply (as in Git) and invalidate cursors.
Huge histories get an explicit incomplete answer instead of a slow, repeated scan.
