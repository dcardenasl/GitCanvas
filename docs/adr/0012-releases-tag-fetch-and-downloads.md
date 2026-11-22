# ADR 0012: Releases, explicit tag fetch and asset downloads

## Status

Accepted — 2026-11-22 (implemented; v0.9 not yet released). Reviewed by the Architect on
2026-11-16. Decisions, bounds, acceptance matrix and task order are in the
[v0.9 implementation plan](../plan/2026-11-16-v0.9-implementacion.md); verification
evidence and open gates are in [`docs/verification/v0.9.md`](../verification/v0.9.md).
David confirmed on 2026-11-16 the two changes to existing behavior: `pull` no longer
fetches every tag, and `checkout`, `pull` and `push` take the per-directory write lock.

## Context

The GitHub REST client today does two things, confirming a token and listing repositories
to clone, and its module documentation states that nothing the graph shows comes from
there: one data path. Releases are provider data, not Git data, so this principle must be
amended in writing. Tags are currently fetched implicitly: `pull_fast_forward` fetches with
`AutotagOption::All`. The roadmap asks for tag fetch and file download to be explicit
actions, with write protections in place first. The credential rules of
[ADR 0003](0003-scheduling-secrets-and-caches.md) and the clone cache of `github/cache.rs`
must stay intact. The existing write gate has two permits and a 30 second wait, shared by
every state-changing command, including saving the token.

## Decision

**Data paths.** Git data still comes only from the local clone through libgit2. Release
metadata and notes come from the GitHub REST API, read-only and bounded, and every response
names its source (`github { owner, name }`) so later providers can extend it. No release
field feeds the graph or the history. Querying notes fetches no tags and no assets.

**Source and remote.** `owner/name` comes from the effective remote URL and is validated
with `RepositoryName::parse`; the remote must pass `is_github_https`. With several GitHub
remotes the upstream remote of the current branch wins, else `origin`. SSH and non-GitHub
remotes answer `unsupported_source`; this is a documented product limit.

**Gates.** A new transfer gate (two permits, 30 second wait) carries long network work:
`get_releases` and `download_release_asset`. `fetch_tag` uses the write gate. `cancel_transfer`
uses no gate, only a cancellation flag. Reading the local release cache uses the read gate.
Permit first, then lock.

**Write lock.** `checkout`, `pull`, `push` and `fetch_tag` take a lock keyed by the
canonicalized Git common directory, so tabs and worktrees of one repository serialize.
Waiting is bounded at two seconds and fails with a typed `RepositoryBusy`. The lock is
released by RAII. It protects within the process only; libgit2's per-reference lockfiles
cover other processes.

**Tag fetch.** A refspec without `+` is not enough: libgit2 overwrites a local tag when the
remote object descends from it. `fetch_tag` therefore validates the name, resolves the local
tag, lists the remote reference and compares objects before writing. Equal is
`AlreadyPresent`, different is `Conflict`, missing is `NotFoundOnRemote`, none of them
writes. Only when no local tag exists does it fetch the object into a private temporary
reference with `AutotagOption::None`, create `refs/tags/<name>` without force, and delete the
temporary reference.

**Pull.** `pull` stops fetching every tag and uses `AutotagOption::Auto`, Git's default:
only tags that point at what was just fetched.

**Downloads.** The asset URL comes only from the validated REST response. A dedicated HTTP
agent follows redirects by hand, at most five, requiring `https`, port 443 and a host from
one allowlist: `api.github.com` (first hop), `github.com`, `objects.githubusercontent.com`
and `release-assets.githubusercontent.com`, to be checked against GitHub's current
documentation before it ships. The token is sent only on the first hop. The 1 GiB ceiling is
enforced against the API size, `Content-Length` and the bytes actually received, and free
disk space is checked first. The native save dialog is opened from Rust, never with a path
from the webview. The file is written to an exclusive temporary name in the destination
directory, symbolic links are not followed, and it is renamed without replacing anything the
user did not confirm. The `sha256` digest is verified when the API supplies one.

**Errors.** New variants are added to `AppError` (`AccessRequired`, `RateLimited`, `Offline`,
`NotFound`, `UnsupportedSource`, `RepositoryBusy`); `Auth` and `Network`, returned by the
existing verification and listing calls, are unchanged. No error carries the token. The
interrupted action is kept in frontend memory and resumed after the token is stored, but
never starts a download whose destination was not already chosen.

**Cache.** One JSON file per repository with a flat name from `cache_entry()`, at most 50
repositories and 20 MiB, with a capture date and no secrets, separate from the clone cache.
Eviction happens inside the cache module on write.

**Notes.** Plain text only: no HTML, no remote images, no links opened from the app. Each
note is cut at 256 KiB with a visible mark; a response is capped at 8 MiB.

## Consequences

The product gains a second, clearly labeled data source without weakening the single-path
rule for Git data. Releases work offline from a bounded cache. Tags and downloads happen only
when the user asks, and a local tag is never moved. Long transfers cannot starve token
saving or cancellation. The cost is a new gate, a per-directory lock that can briefly answer
"repository busy" to ordinary Git actions, a hosts allowlist to maintain, an extra Tauri
dialog permission, and no support for SSH remotes in this version.
