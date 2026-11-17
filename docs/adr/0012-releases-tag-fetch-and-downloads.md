# ADR 0012: Releases, explicit tag fetch and asset downloads

## Status

Proposed — 2026-11-16. Decisions, bounds, acceptance matrix and task order are in the
[v0.9 implementation plan](../plan/2026-11-16-v0.9-implementacion.md). Decision CR-D15 of that
plan changes existing behavior; David confirmed it on 2026-11-16.

## Context

The GitHub REST client today does two things, confirming a token and listing repositories
to clone, and its module documentation states that nothing the graph shows comes from
there: one data path. Releases are provider data, not Git data, so this principle must be
amended in writing. Tags are currently fetched implicitly: `pull_fast_forward` fetches with
`AutotagOption::All`. The roadmap asks for tag fetch and file download to be explicit
actions, with write protections in place first. The credential rules of
[ADR 0003](0003-scheduling-secrets-and-caches.md) (token only to `https://github.com`, never
returned to the interface) and the clone cache of `github/cache.rs` must stay intact.

## Decision

**Data paths.** Git data still comes only from the local clone through libgit2. Release
metadata and notes come from the GitHub REST API, read-only and bounded, and every response
names its source (`github { owner, name }`) so later providers can extend it. Querying notes
fetches no tags and no assets.

**Cache.** One JSON file per `owner/name` in the data directory, capped at 50 repositories
and 20 MiB, with a capture date and no secrets. It is separate from the clone cache. Offline,
the stored copy is served and labeled with its date.

**Tag fetch.** A single new write command, `fetch_tag`, with the exact refspec
`refs/tags/<name>:refs/tags/<name>` and no `+`: it never forces and never moves a local tag
that points elsewhere. The name is validated with Git's reference-name rules before any
network use, the remote must be the identified GitHub repository, the command goes through
the write gate and is serialized per Git common directory so tabs and worktrees of one
repository cannot write at once.

**Pull.** Confirmed by David on 2026-11-16, `pull` stops fetching every tag and uses
`AutotagOption::Auto`, Git's default: only tags that point at what was just fetched.

**Downloads.** The asset URL comes only from the validated REST response. Redirects are
accepted only to GitHub content hosts and the token is never forwarded after a redirect. The
destination is chosen by the user in the native dialog; the file is written to a temporary
name and renamed on success, never overwrites without confirmation, is capped at 1 GiB and
is checked against the `sha256` digest when the API supplies one. Progress and cancellation
are explicit.

**Access errors.** Typed errors (`auth_required`, `rate_limited`, `offline`, `not_found`,
`unsupported_source`) never carry the token. The interrupted action is kept in frontend
memory and resumed after the token is stored; nothing about it is persisted.

**Notes.** Rendered as plain text. No HTML, no remote images, no links opened from the app.

## Consequences

The product gains a second, clearly labeled data source without weakening the single-path
rule for Git data. Releases work offline from a bounded cache. Tags and downloads happen only
when the user asks. The cost is a new write command, a per-directory write lock, a hosts
allowlist to maintain and a visible behavior change in `pull`.
