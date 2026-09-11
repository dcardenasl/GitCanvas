# ADR 0001: Working-tree observation and fingerprint fallback

## Status

Accepted

## Decision

Observe both the repository's Git metadata and its working directory with one
owned watcher. Debounce events for 250 ms and publish an explicit scope:
`Metadata`, `Worktree`, or `Degraded`. The frontend invalidates only the query
families affected by the scope.

Every watch start and stop carries a monotonically increasing generation. A
watch can be installed only if its generation is still current, and cleanup
can stop only the generation it created.

The visible frontend polls a cheap working-tree fingerprint every five seconds
and changes to two seconds after watcher failure. Polling invalidates local
queries only when the fingerprint changes. Native observation remains the
normal path; polling is the recovery path for network volumes, permissions and
platform event gaps.

## Consequences

History does not re-read on every editor save. Watcher failures are actionable
instead of silently leaving stale local changes on screen. The fingerprint is
not a replacement for a full diff and never crosses the IPC boundary as a
large payload.
