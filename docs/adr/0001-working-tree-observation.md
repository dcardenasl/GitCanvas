# ADR 0001: Working-tree observation and fingerprint fallback

## Status

Accepted

## Decision

Observe Git metadata with one owned native watcher; do not recursively watch
working-tree files. Subscribe to repository metadata and common-directory paths,
recursively watching only `refs` subdirectories. Classify metadata events relative
to the metadata directory. Index changes publish `Worktree`; history metadata changes
publish `Metadata`. Debounce events for 250 ms with a two-second maximum and publish an explicit scope:
`Metadata`, `Worktree`, or `Degraded`. The frontend invalidates only the query
families affected by the scope.

Every watch start and stop carries a monotonically increasing generation. A
watch can be installed only if its generation is still current, and cleanup
can stop only the generation it created.

Because file edits need not update Git metadata, the visible frontend polls a
working-tree fingerprint. Its base interval is five seconds while the watcher is
healthy and two seconds after watcher failure; adaptive backoff is capped at 60
seconds. Polling invalidates local queries only when the fingerprint changes. This
also covers network volumes, permission failures and platform event gaps. The
fingerprint is an opaque revision token, not a durable or cryptographic identifier.

## Consequences

History does not re-read on every editor save. Watcher failures are actionable
instead of silently leaving stale local changes on screen. GitCanvas does not stage,
unstage, commit or delete user files as part of inspection, but it is not strictly
read-only: explicit checkout, fast-forward pull and push actions mutate repository or
remote state, and clone creates an app-owned copy. Checkout guards local changes and
push never forces. The fingerprint is not a replacement for a full diff and never
crosses the IPC boundary as a large payload.
