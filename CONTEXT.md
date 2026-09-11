# GitCanvas architecture context

## Working Tree

The working tree is the selected repository on disk plus its Git index. GitCanvas
is read-only: it observes and displays local changes but never stages, unstages,
commits, checks out, or deletes files as part of this feature.

## Staged and Unstaged

`Staged` compares `HEAD` with the index. It reads selected file contents from
the index blob. `Unstaged` compares the index with the working directory. It
reads selected file contents from the confined working-directory path. The same
path may therefore appear in both groups when it was staged and then edited
again.

## Snapshot and Revision

A `Snapshot` is one bounded response containing both local groups. A `Revision`
is a deterministic fingerprint of `HEAD`, the index, Git status and relevant
working-tree metadata. Every detail request may carry the snapshot revision;
the engine rejects a stale or mixed read with a typed error instead of showing
old content as current.

The initial response contains summaries only, with at most 250 files per side.
Diff patches and complete file contents are separate on-demand requests.

## Watcher

The native watcher observes the working tree and Git metadata. Metadata events
invalidate history, branches and tags. Working-tree events invalidate local
change queries. Each watch has a generation token so an asynchronous watcher
for an old repository cannot publish into the newly opened repository.

The frontend also polls the lightweight revision fingerprint every five seconds
while visible, and every two seconds while the watcher is degraded. A changed
fingerprint invalidates only local queries. Degraded watcher state remains
visible and can be retried manually.

## Resource policy

Initial patches are limited to 1 MiB per file and initial contents to 2 MiB.
Explicit expansion is capped at 16 MiB for patches and 32 MiB for contents.
Binary detection examines the first 8 KiB. Oversized data is reported without
materializing the complete file; explicit requests above the hard limit are
typed resource errors.

## Code ownership

`crates/gitcanvas-core/src/worktree.rs` owns local-change semantics. Path
resolution and content normalization are centralized there and in the shared
blob reader. `src/state/session.ts` owns one discriminated selection. Generated
Specta bindings are the only Rust/TypeScript contract; `src/lib/ipc` is the
small typed adapter used by React Query.
