# ADR 0013: Dedicated release-asset discovery and server-side resolution

## Status

Accepted and implemented — 2026-11-23. Implemented in the v0.9.0 release candidate on `dev`; PR #24 is open. No merge, remote `v0.9.0` tag, or GitHub Release exists yet. The independent Validator rejected the closure record because the release commit is followed by six commits and the previous CR-17 commit reference was inaccurate; David accepts preserving this history because the PR contains the complete v0.9 delivery. This process decision does not alter the Validator verdict or approve the merge. David chose a dedicated `get_release_assets` query for CR-12. This decision supplements ADR 0012 and CR-D24 with the ownership and bounds of that query; it does not replace their accepted gate assignments.

## Context

`ReleaseInfo` and the version-1 release cache contain notes and release IDs,
not asset metadata. The core downloader accepts a `DownloadRequest` with a URL,
filename, size and optional digest. Exposing that request as an IPC argument
would let the webview choose the URL and the integrity/size claims. The webview
needs a separate discovery command to choose an asset by identity.

GitHub's [release assets API](https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28)
lists assets by release ID and downloads an asset by its repository-scoped asset
ID. The latter endpoint alone does not prove membership in a particular release.
The [release API](https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#get-a-release)
provides the release ID and draft status. Drafts remain outside v0.9.

## Decision

**IPC identity and output.** Add
`get_release_assets(path, release_id) -> ReleaseAssetList`, with
`ReleaseAssetList { source, release_id, assets, truncated }` and
`ReleaseAssetInfo { id, name, size, sha256 }`. `sha256` is optional and retains
the `sha256:<hex>` form used by the downloader. The response is metadata only;
it contains no URL, credential or destination. `name` is presentation data and
is sanitized again when suggested in the Rust save dialog. Release and asset IDs cross IPC as canonical positive decimal **strings**
(`^[1-9][0-9]*$`) within the internal `u64` range, including release IDs in
`get_releases`/`get_cached_releases` responses. Rust parses with checked `u64`
conversion before constructing a REST path; it rejects zero, signs, whitespace,
leading zeros, separators and overflow. IDs are never converted through a
JavaScript number. Use dedicated IPC DTOs/adapters for release lists and asset
descriptors where necessary, keeping the existing core numeric types and version-1
cache representation. This avoids Specta's unsupported `u64` export and preserves
all 64 bits without changing persisted data.

`download_release_asset` accepts repository path, release ID, asset ID and a
bounded transfer ID, never URL, filename, size, digest, token or destination from
the webview. Existing progress, cancellation and outcome rules still apply.
Both commands authorize the repository through `with_repo` and derive the
GitHub source from the effective remote according to CR-D26.

**Fresh release membership.** A shared core resolver first requests
`GET /repos/{owner}/{repo}/releases/{release_id}` and verifies the returned ID
and `draft = false`. It then reads
`GET /repos/{owner}/{repo}/releases/{release_id}/assets?per_page=100&page=N`.
Paths are constructed from the validated source and numeric IDs, never from
`assets_url`, pagination links or any webview URL. Discovery uses these pages
to return asset descriptors. Download performs fresh resolution itself and
selects the requested asset from these pages, even when discovery already ran.
A repository-scoped asset lookup by itself is insufficient.

**Bounds.** Reuse the release-list budgets: at most ten asset pages of at most
100 entries, at most 1,000 descriptors, and a hard 8 MiB body limit on each
metadata response, including the release check, before deserialization.
Reject a server page exceeding the requested 100 entries; do not merely trust
`per_page`. Stop on a short page. A full tenth page sets `truncated = true`
without an eleventh request. No cursor or pagination URL crosses IPC.
For download, resolution may stop once the requested asset is found. If absent
from a complete listing, return `NotFound`; if absent when the bound is reached,
return `ResourceLimitExceeded`, without claiming the asset does not exist.
One command performs at most eleven metadata requests. All metadata requests
retain the existing finite REST timeouts; no unbounded retries are introduced.

**URL provenance and download.** Only the matched fresh REST asset supplies
`name`, `size`, `digest` and its API `url`. Require that URL to identify exactly
`https://api.github.com/repos/{owner}/{repo}/releases/assets/{asset_id}`
for the selected source and matched ID, with HTTPS/443, no user information,
query or fragment. Reject malformed or mismatched URLs before the save dialog
or binary transfer. New asset metadata requests do not automatically follow
redirects: unexpected redirects fail, preventing a foreign response from becoming
trusted metadata. Loopback endpoints remain available only through explicit test
constructors. The dedicated binary downloader keeps CR-D18/CR-D25: manual
redirects, token only on the initial API hop, existing hosts, size/disk/digest
checks and destination protections. Metadata is validated before the native
save dialog, and cancellation is checked before opening it or starting binary I/O.

**Gates, supplement to CR-D24.** `get_release_assets` uses the existing transfer
gate, with its two permits and 30-second wait. `download_release_asset` owns
one transfer permit across resolution and download. Shared core resolution takes
no gate and calls no IPC command, so download never recursively acquires a
transfer permit by calling `get_release_assets`. Read/write gates, Git common
directory locks, `get_cached_releases`, token saving and gate-free cancellation
keep their current assignments. This addition is proposed explicitly here rather
than silently editing CR-D24.

**Errors and cache compatibility.** Reuse `AppError`: invalid decimal-string IDs or URL metadata
are rejected with `InvalidInput`; a missing/draft release or missing asset from
a complete listing returns `NotFound`; API failures retain release-specific
`AccessRequired`, `RateLimited`, `Offline` and existing diagnostic variants.
No error includes a secret. Neither discovery nor resolution writes persistent
asset metadata, and neither falls back to stale metadata for authorization.
The current release cache schema, bounds and offline release/notes behavior stay
unchanged. Offline asset discovery returns `Offline`. Frontend memory may retain
descriptors for presentation, but each download still requires fresh resolution.
Regenerate bindings from Rust; do not hand-edit them. Existing release-list
responses, credential APIs and graph/history inputs keep their contracts.

## Consequences

The webview can select assets without controlling network targets or transfer
metadata. Download verifies membership against the selected published release and
uses the existing secure downloader. Queries and downloads remain bounded and
cannot consume read/write permits or deadlock through nested transfer permits.

Each discovery or download adds a release check and up to ten paginated asset
requests. A full final page conservatively reports truncation, and assets beyond
the cap cannot be downloaded through this interface. Per-response bounds permit
up to 88 MiB of metadata traffic over eleven responses; the descriptor result is
bounded by ten 8 MiB asset responses. This is the reused budget, not an unlimited
aggregate response. Asset discovery requires connectivity even when notes are
cached. GitHub does not provide an atomic transaction spanning membership checks
and binary transfer; deletion/change after resolution remains a typed transfer
failure, and the existing size/digest checks protect the received file where
available. New providers and persistent/offline asset caching require a later
explicit decision.
