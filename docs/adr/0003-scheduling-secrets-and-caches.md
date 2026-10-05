# ADR 0003: Read/write scheduling, credential scope and the history cache

## Status

Accepted

## Decision

**Scheduling.** Blocking git work is admitted through two gates, one for reads
and one for writes and network operations. Only reads are retried, and only when
the error says it is transient (`AppError::ResourceExhausted`). Writes run once.

**Credentials.** The interface sends the token once as input to
`store_github_token`; Rust trims and verifies it before storing it in the OS keychain.
The backend never returns the token. Later REST requests and Git credential callbacks
read it inside Rust. The token is offered only to `https://github.com`, once per
credential kind. Clone URLs must be the named repository's own GitHub URL, and the
cache directory is derived from the validated `owner/name`.

**Repository access.** `AllowedRepos` stores canonical paths authorized by
`open_repository`, startup selection or clone. Commands operating on a repository use
`with_repo` to check that allowlist and create a fresh `ActiveRepo` for their own Git
handle. `validate_repository` checks a candidate without authorizing later operations.

**History cache.** The ordered commit ids of a walk are cached up to two million,
because libgit2 pays a full traversal to resume a topological walk. Beyond that
budget pages stream and repeat the traversal; the budget is injectable so that
path is tested.

**Pagination.** Cursors are bound to the state they were read from: history to its
frozen roots, local changes to a revision. Only immutable commit trees page by
offset.

## Consequences

A slow push or clone cannot freeze history reads. A failed write is reported, not
silently repeated. A remote that is not GitHub cannot receive the token; IPC is used
only to submit it once, and the interface never receives it back. Repository commands
reject paths that were not explicitly authorized. Paging a large repository slices a
list. The cost is memory (about 40 MB at the cache's ceiling) and a documented limit
for histories beyond two million commits.
