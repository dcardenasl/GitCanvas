# ADR 0014: Isolated loopback transport for native release E2E

## Status

Accepted — 2026-11-22. Supplements the test-only endpoint exception in CR-D25
and ADR 0012/0013 for CR-15. Their production source, URL, credential and
redirect rules remain in force. This decision does not itself claim
implementation of the test harness.

## Context

CR-15 requires native releases E2E with a local fake REST server, without live
GitHub requests. The current native fixture covers an unsupported remote rather
than release listing and actions. The plan currently permits alternate REST bases
only in crate tests; the core client explicitly avoids environment-controlled
production endpoints. A native executable needs an explicit test-only injection
point. Repointing only REST is insufficient for a complete download: ADR 0013
requires an exact API asset URL and CR-D25 rejects loopback binary URLs.

The existing `e2e` feature enables the native WebDriver harness and private
webviews; WDIO already supplies a temporary application data directory. Cargo's
`release` profile is also used for E2E builds, so profile name alone cannot
identify a distributable production binary.

## Decision

**Compile-time boundary.** Build the endpoint injection, environment-variable
reader and local transfer policy only with `cfg(feature = "e2e")`. Keep the
feature opt-in and forward it explicitly to the core only if a core test seam
requires it. The ordinary REST constructors continue to use the fixed GitHub
endpoint and never inspect the test variable. Release/package jobs must compile
without `e2e`; they must not use `--all-features` for the published artifact.
An optimized E2E binary is a test artifact and must not be distributed.

**Startup injection.** The E2E harness starts one fake server bound to a literal
loopback IP and an ephemeral nonzero port. Tauri reads an E2E-specific variable,
`GITCANVAS_E2E_API_BASE_URL`, once at startup, validates it, and injects an
immutable test transport through an explicit constructor. It is not an IPC
argument or a value read from repository configuration, preferences or GitHub
responses. When supplied, invalid configuration fails startup; it never falls
back silently to GitHub. In a non-E2E build the variable is inert.

Accept only `http://127.0.0.1:<port>` or `http://[::1]:<port>` (an optional final
slash is normalized), with an explicit port in 1–65535, no user information,
path beyond `/`, query or fragment. Reject hostnames, including `localhost`,
non-loopback addresses, alternate loopback spellings and unspecified ports.
The injected policy pins this exact normalized scheme/host/port origin. Its
client bypasses environment-configured proxies for local test traffic.

**No user credentials or application data.** The transport is anonymous by
default; authentication scenarios use synthetic in-memory credentials isolated
from the real OS keychain. E2E requests must never invoke normal keychain
read/write/delete operations. Operations not supported by the synthetic provider
fail locally, without contacting GitHub or falling back to real credentials.
The fake server does not receive user tokens, user repository contents or
application data. Use generated temporary repositories and synthetic metadata.

Require a harness-owned temporary application data directory before enabling the
transport, using the existing ownership/isolation checks where available. Do not
fall back to the user's directory. Release/clone caches, workspace state and logs
stay within that directory; private E2E webviews isolate localStorage. Fixture and
server teardown only remove resources owned by the run. Do not use global shell
exports or alter the user's persistent environment.

**REST and binary policy.** Production source selection still validates the
fixture's synthetic `https://github.com/owner/repo` remote. The test transport
changes the network origin, not the logical provider/repository identity. Reuse
release parsing, bounds, published-release/member checks, gates and decimal ID
handling. Metadata requests keep automatic redirects disabled; reject any 3xx,
including cross-origin destinations, without sending a follow-up request.

The E2E-only resolver may validate the matched asset's API URL against the pinned
loopback origin and the exact `/repos/{owner}/{repo}/releases/assets/{asset_id}`
path instead of `api.github.com`. Reject user information, query, fragment and
mismatched source/ID just as in production. Only a matched REST asset can create
a download request; the webview still supplies identities alone.

A separate E2E-only downloader policy accepts that same pinned origin for the
binary response and at most five manual redirects, each restricted to the exact
same origin. Another loopback port or IP is a different origin and is rejected.
Never reuse a blanket `allow_loopback` switch for arbitrary targets. Local HTTP
is allowed solely under this injected test policy. Production CR-D25's four-host
HTTPS allowlist, API first hop and credential rules remain unchanged.
Synthetic credentials, when needed, are sent only on the initial request, never
on redirects. Real credentials are never acquired for this transport.

Keep the native Rust save dialog, filename sanitization, overwrite confirmation,
temporary-file exclusivity, cancellation, disk/size/digest checks and atomic
rename in the native download path. Automation must interact with the native
flow or report that step unverified; accepting a destination from webview IPC
would require a separate contract decision. REST simulation alone does not test
libgit2 `fetch_tag`: use its dedicated Git fixture/evidence and report native
fetch/authentication gaps explicitly.

**Verification.** Add the following checks to CR-15 evidence, with commands,
platform and observed results:

- Non-E2E build: setting the test variable does not change the fixed REST origin;
  the local transport constructor/policy cannot be used. Inspect the actual
  publication build flags to show that the shipped artifact excludes `e2e`.
- E2E startup: valid IPv4/IPv6 configurations work; user information, hostnames,
  non-loopback origins, missing ports, paths, queries and fragments fail before
  a request. Missing/unsafe fixture data directory fails without reading user data.
- Requests use generated fixtures only and never touch the real keychain. Assert
  absence of Authorization in anonymous mode, only synthetic credentials in the
  isolated auth scenario, and zero non-loopback requests/fallbacks.
- Metadata redirects cause no follow-up request. Binary redirect attempts to
  another port, host or scheme fail without a request to that target; an allowed
  same-origin redirect succeeds within the existing five-hop budget.
- Fresh release membership and exact local asset path validation reject hostile
  metadata before the native save dialog or binary request. Production URL tests
  still reject loopback and retain the four-host HTTPS rules.
- Native listing, inert notes, descriptors, explicit download, progress,
  cancellation and offline cache behavior use the real IPC path. Verify the
  resulting file and temporary cleanup when the native dialog is exercised.
  Retain existing size/digest, pagination and error cases rather than replacing
  them with canned IPC responses.

## Consequences

CR-15 gains deterministic native REST coverage without external GitHub access or
user data. The price is an explicit test transport, isolated synthetic credential
provider and compile-time policy split that require regression coverage. This is
a bounded testing exception, not an additional production provider or a general
endpoint override. Local downloads verify the native application path but do not
establish real GitHub CDN behavior. Platform-specific dialogs/rename, screen
reader behavior and unsupported native interactions remain gates until exercised
and documented. ADR 0012/0013 are supplemented, not rewritten or superseded.
