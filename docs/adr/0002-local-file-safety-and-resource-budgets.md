# ADR 0002: Local-file confinement and resource budgets

## Status

Accepted

## Decision

All local paths are relative repository paths. Absolute paths, `..`, root and
platform prefix components are rejected. Existing working-tree paths are
canonicalized and must remain under the canonical repository root; symlinks
whose real destination is outside that root are rejected. Directories and
non-blob index entries are not file content.

The engine reads disk content using `stat → read → stat`, with one controlled
retry. A changed stamp returns `WorktreeChanged`, so the UI closes the open
local view instead of presenting a mixed revision.

The shared content reader applies identical binary, UTF-8 and line policies to
commit blobs, index blobs and disk files. Initial and explicit limits are hard
contracts: 1 MiB/16 MiB for patches and 2 MiB/32 MiB for content. Oversized
responses contain metadata only and never allocate the entire file.

## Consequences

The IPC payload is bounded and JavaScript-safe for counts and byte sizes. A
large or changing file produces a visible, actionable state rather than a
freeze or a stale diff. This intentionally rejects external symlinks even when
the operating system would otherwise permit reading them.
