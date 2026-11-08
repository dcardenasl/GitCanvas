# ADR 0009: Read-only stash inspection

## Status

Accepted for stash listing and inspection (ST-1/ST-2) — 2026-11-08. The observation, IPC and
UI sections remain planned for subsequent tasks. Product decisions ST-D01–ST-D10
were agreed with David; stash inspection is not yet exposed in the application.
See the [implementation plan](../plan/2026-11-08-v0.7-implementacion.md)
for the decision record, task dependencies, bounds and acceptance matrix.

## Context

The v0.7 roadmap adds stash listing and inspection without creating, applying or
deleting stashes, and without adding their commits to the graph. Current readers
support first-parent commit diffs and live staged/unstaged changes. Neither source
alone models all the saved states of a stash.

Stashes use a shared repository reflog. Positional names such as `stash@{0}` change
when entries are added or removed. Removing an older entry can change the list
without changing the tip of `refs/stash`. Linked worktrees share this data, while
their navigation and authorization remain independent.

## Decision

### A dedicated source with shared readers

Introduce a Rust stash module with typed listing, file summaries, per-file diff,
content and fingerprint operations. Each command uses `runtime::read` and `with_repo`.
The core remains independent of Tauri; generated bindings remain the IPC contract.
No stash mutation API is exposed.

Resolve immutable object ids: W is the stash commit, H its base parent, I the index
parent, and U the optional untracked parent. Validate the structure and required
objects before reading a selected comparison.

| View | Comparison |
| --- | --- |
| All | H to W, plus empty tree to U when present |
| Staged | H to I |
| Unstaged | I to W |
| Untracked | Empty tree to U |

All is a net comparison, not the union of the staged and unstaged file lists.
Untracked includes ignored files actually saved in U; current ignore rules do not
reconstruct their historical category. File keys include origin to avoid collisions.

Reuse tree-diff collectors, rename detection, file summaries, path validation and
bounded blob readers. Extract helpers where necessary without changing ordinary
commit first-parent semantics. Reuse the existing diff renderer and highlighting.
Do not disguise a stash as an ordinary merge or as live local changes.

The diff is initially selected. Whole content can be read from either side of the
chosen comparison, with the old path for a rename. Added files have only the saved
side; deleted files only the previous side. Reads never follow a saved symlink to
disk or use a lossy path to select a different blob.

### A bounded, revisioned list

Rows retain their reflog order and original messages. The OID identifies saved
content; the displayed reflog index is only an alias in one list revision. Duplicate
entries are not deduplicated. If several entries refer to the selected OID, list
reconciliation uses its newest alias without changing content.

The list revision incorporates the complete bounded reflog snapshot and ref state,
not only the current tip. Cursors carry the revision, normalized search and position.
A stale cursor restarts listing; it never reinterprets a selected index as another
stash. Search covers all entries in the snapshot, not only loaded frontend pages.
Successful listing can also report whether the selected OID is present globally.

The existing `git2::Reflog` API loads the full log. For file-backed references, use
a narrowly scoped bounded snapshot reader for the shared `logs/refs/stash`, with
maximum+1 reads, explicit record limits and differential tests against Git/libgit2.
Check stable file and ref state around the read, with two total attempts. Do not
claim bounded allocation from a pre-read `stat` followed by an unbounded library read.
Unsupported storage formats or inconsistent ref/log state produce a section error,
not an empty list or a production shell fallback. This is a read adapter, not a
general reflog editing subsystem.

Initial budgets are 8 MiB and 20,000 records per snapshot, 64 KiB per record, up to
200 stash rows per page, 250 file summaries per page and 5,000 changed files per
comparison. Patch/content limits are the existing shared limits. Rust publishes all
limits. Per-mode counters are independent. Resource failures are explicit; no
partial list is advertised as complete. Implementation tasks must measure library
work as well as response size before claiming responsiveness.

Branch labels are optional parsing of recognized Git messages, never a guessed
relationship to current branches. Preserve unknown messages. Label the reflog
timestamp as the record date, rather than the date of the base commit.

### Independent observation

Add a stash change scope for the shared ref and reflog. Stash-only events invalidate
stash listing and its fingerprint, leaving graph roots, pages and geometry intact.
Debouncing preserves stash notifications alongside existing change scopes.
Observe only the needed metadata paths and ancestors, including creation and atomic
replacement; do not recursively watch all logs or project files.

A lightweight stash fingerprint and bounded adaptive polling provide backup for
the verified active project only. Reactivation refreshes stashes even when ordinary
refs are unchanged. Inactive projects have no watcher or periodic reads. Fingerprint
metadata is not a cryptographic content guarantee; explicit refresh reads the full
bounded snapshot and revision.

Deleting a selected stash from the list preserves its view with a notice. Its OID
can still be read while objects or existing bounded cache entries remain available.
Object loss produces an unavailable state and explicit return action. Do not create
protective refs or promise recovery after garbage collection. Listing errors alone
never imply that a selected stash was deleted.

### Session navigation and delivery

Use per-tab transient stash inspection state over the existing graph selection.
Selecting a stash updates the inspector and keeps the graph visible. Choosing a
file opens its diff in the centre. The ordinary sidebar folding/pinning rule remains.
Changing comparison retains a file only if it belongs to that comparison; otherwise
the centre asks for a selection, without opening another file automatically.

Returning from a diff clears the file and keeps the stash inspector. Closing stash
inspection restores graph navigation. Explicit commit/ref/local-change navigation
leaves the stash view. File history and stash inspection are mutually exclusive.
Escape handles menus before file/view navigation and restores sensible focus.

Tab switching retains OID, comparison, file and content side during the session.
The centre distinguishes graph, choose-file and file states: a newly opened stash
keeps the graph, while changing to a comparison that excludes the open file shows
the selection prompt. These states cannot be represented by one ambiguous null path.
Workspace serialization preserves the underlying ordinary selection and excludes
stash state. Reuse `section:stashes` in existing collapsed-section preferences; the
current schema (5) already accepts that bounded key, so no schema bump is needed.

Queries include root, OID, comparison, source/file key, side and expansion as
applicable. Release data on close and under the existing active-plus-five-inactive
project bound. Bound search variants as well; no unbounded cache of typed queries.
Within each root, retain heavy stash queries only for the inspected OID and current
file; expanded content replaces its initial variant. Browsing more stashes must not
grow an unbounded cache inside the active root.
Late responses cannot update another root, stash or mode. Stash inspection does not
alter graph filters, colors, principal selection or filter undo history.

## Consequences

ST-1 implements listing through separate contract/pagination, borrowed-record
decoder and stable snapshot modules. File identity checks are shared with the
existing worktree reader. Unix nonblocking/no-follow open flags and Windows
reparse-point handling protect the bounded reader from nonregular replacements.
The direct Unix `libc` dependency supplies flag constants only, using its already
locked version and no unsafe application code. Git/libgit2 are differential test
oracles only, not production subprocesses or fallback readers.

The decoder rejects malformed/unterminated records instead of skipping them. It
preserves absent messages, signed timestamps and lossy-display status explicitly.
Search uses trimmed, locale-independent Unicode lowercase without accent removal
or normalization. Cursor anchors also include the original entry position, so
identical duplicate records cannot disguise an accidentally altered position.

The feature follows the current three-panel UI and reuses its rendering and bounded
read policies. It introduces a distinct saved-data source, a reflog-specific read
adapter and change observation, rather than extending the graph or mutation layer.

Stash listing is shared by linked worktrees as Git defines, while tabs keep their own
context. Unknown branch metadata and unsupported storage are explicit limitations.
Read-only retention of a removed stash is opportunistic and ends when its data is
unavailable. Engineering tests must cover cancellation between saved states, reflog
changes without a tip change, simultaneous event scopes and immutable content keys.

ST-2 resolves W/H/I/U and exact file keys through comparison and inspection modules.
Shared delta readers identify files by byte path/position, not lossy display names.
An ODB-header pass checks 64 MiB of unique readable blob work before similarity or
statistics. Blobs beyond the 32 MiB content cap retain metadata and exact-only rename
pairing with a notice. Binary and non-blob statistics are explicitly unavailable.
UTF-8 replacement expansion is counted before allocating returned text. No new
cache or production subprocess is introduced. The measured native tree-diff stage
remains libgit2 work, not a claimed cancellable or hard-deadline operation.

## References

- [Git stash](https://git-scm.com/docs/git-stash)
- [Git worktree: references](https://git-scm.com/docs/git-worktree#_refs)
- [Repository layout](https://git-scm.com/docs/gitrepository-layout)
- ADR 0002 (file safety), ADR 0006 (workspace), ADR 0007 (graph), ADR 0008 (file history).
