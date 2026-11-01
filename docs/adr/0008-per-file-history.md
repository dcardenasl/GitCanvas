# ADR 0008: Per-file history

## Status

Accepted — 2026-11-01. Planned for the v0.6 delivery; not implemented yet.

## Decision

**Engine.** Rust answers one explicit query, `(path, start commit)`, and returns the
commits that changed that path among the start commit's ancestors. The interface starts
at the checked-out HEAD, resolved to a full id when the view opens, so the complete file
history is shown. When the commit it was opened from is not an ancestor of HEAD, the
query starts at that commit and the view says so. A detached HEAD is a valid start; an
unborn HEAD has no history and the action is unavailable. The frontend never
computes history. The query is independent of the graph's reference filters: it may find
commits outside the current graph scope, and it never alters those filters.

**Ordering and walk reuse.** The order is the existing deterministic topological/time
order of `history.rs`, frozen on the single root `[start]`. The walk-id producer is
extracted from `history.rs` and shared, so there is one traversal implementation. File
history keeps its own cache partition: one snapshot of at most 500,000 ids. A larger walk
streams without being cached. It never evicts graph snapshots and does not change the
graph's budgets (2,000,000 ids, eight snapshots).

**Locating a commit.** A request may carry `focus_commit`. The engine keeps walking, within
the per-request work limit and resumable by cursor, until that commit is emitted and
returns the page that contains it. If the commit is not emitted under simplification, or
the budget runs out first, the response says which, and the list starts at the top.

**Incomplete history.** A shallow repository (`is_shallow`) marks every response with a
persistent notice: the oldest visible commit is not necessarily where the file began.
A missing object (partial clone) is a recoverable error for that page or row, never an
empty history.

**Freshness.** A query is immutable. When HEAD or the references change while the view is
open, the interface keeps the query, shows a notice and offers *Refresh*, which starts a
new query from the new HEAD and keeps the path and the selected row if it still exists.
Pages of two different starts are never mixed.

**Simplification (`git log -- <path>` default).** Positions are a total order, so each
commit is examined once. A commit is *followed* when a followed child selected it. For a
followed commit, the path entry (object id and file mode, or absence) is compared with
each parent's:

- identical to some parent: not emitted; only the first such parent is followed;
- different from every parent: emitted; every parent is followed;
- root commit: emitted when the path exists.

Comparison reads the tree entry of one path, never a diff, so cost is proportional to
followed commits and path depth. A commit reached through several followed children
keeps the tracked path of the first arrival in walk order (deterministic).

**Renames.** A rename is looked for only when the tracked path is absent from the first
parent and present in the commit. The commit's first-parent tree diff is run through
`find_similar` with Git's default similarity (50%), renames only, no copies. If the path
is the destination of a rename, the lineage continues under the source path and the row
carries `renamed_from`. Every row carries `path_at_commit`. Merge commits do not search
renames: an add-only merge ends that lineage. No copy, split or merge-of-files tracking.

**Explicit limits, never silent.** Constants live in the core module and are published
to the UI through the response, never copied:

| Limit | Value | Effect when reached |
|---|---|---|
| Page size | 1–200 | `InvalidInput` outside the range |
| Followed commits examined per request | 20,000 | Page ends early with `Truncation::WorkLimit` and a cursor that resumes |
| Renames followed per query | 32 | Lineage ends; `Truncation::RenameLimit` at that commit |
| Diff size for rename search | 2,000 deltas | Search skipped; `Truncation::RenameSearchSkipped` at that commit |
| Frontier size carried in a cursor | 256 entries / 1 MiB | Search ends with `Truncation::FrontierLimit`, no cursor |

A result is complete only when the page has no truncation and no `next_cursor`.

**Cursor.** Opaque, stateless: scope hash (path, start commit, walk root), last position
id, rename count and the frontier (followed commits not yet reached, with tracked path).
Position is revalidated against the walk (`ids[index] == id`); anything else, or a start
commit that no longer exists, is `StaleCursor`. Resuming never needs cached state, so
eviction cannot change results.

**Safety.** The path is a UTF-8 repository-relative path under ADR 0002 (no absolute,
`..`, root or prefix components, at most 4,096 bytes) and must resolve to a blob in the start
commit or in some followed ancestor; a tree or submodule path is `InvalidInput`.
Git paths that are not valid UTF-8 appear lossy elsewhere in the interface (U+FFFD); for
them the action is disabled with the cause explained, and the engine rejects any path
that does not resolve to an exact tree entry. Authorization is the existing canonical-path check; nothing stored authorizes Git. The
start commit is an immutable full id.

**Display.** Row diffs and content reuse `get_commit_diff` (first-parent diff, with its
existing rename detection) and `get_file_content`, keyed by `path_at_commit`; no
duplicate reader. A merge emitted by this query is shown against its first parent, as
everywhere else, and flagged as a merge. Deleted paths are queryable: a path absent at
the start commit is valid when an ancestor has it. Uncommitted changes are not rows: the
view links to the existing local diff when the file has any.

## Consequences

Large repositories get bounded, resumable work per request instead of an unbounded scan.
Output matches `git log -- <path>` in the cases covered and diverges knowingly where
documented (no copy tracking, first-arrival path in criss-cross merges, no rename search
inside merges). The UI states those limits instead of promising infallible following.
The extraction of the walk producer keeps one traversal implementation for graph and
file history. Frontend state is per tab and not persisted across restarts. The view replaces the
graph area of its tab and returns to it with selection and scroll restored.
