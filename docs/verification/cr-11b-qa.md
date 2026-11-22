# CR-11b task QA

**Verdict: PASS**

Reviewed commit `6c146c7e9e480a7b88a5cc33f715377004575e66` against parent `09f000cb605a7d341bc753e15208ff7e88280eb2` on macOS.

## Acceptance evidence

| Case / contract | Result | Evidence |
| --- | --- | --- |
| 32: unsafe redirects and redirect count | PASS | `disallowed_redirect_hosts_schemes_and_ports_are_rejected_before_following` rejects an unapproved host, HTTP external URL, and port 444, confirms only the initial request reached the server, and confirms no file remains. `redirect_limit_allows_five_hops_and_rejects_the_sixth` allows five redirects, rejects the sixth, and checks no final destination was written. The HTTP agent disables automatic redirects; `open_asset_response` handles redirects itself and validates every target before following it. |
| 32: token only on API first hop | PASS | `open_asset_response` adds the token only when `redirects == 0` and the host is exactly `api.github.com`; subsequent requests are built without it. `redirect_chain_strips_token_after_first_hop_and_verifies_sha256` directly captures the first request with Authorization and the redirected request without it using the loopback-only test transport. The loopback token allowance is test-only and production rejects loopback HTTP. |
| 33: SHA-256 mismatch cleanup | PASS | `mismatched_digest_rejects_and_removes_temporary_download` returns `Conflict`, leaves no final destination, and leaves no temporary file. The successful `redirect_chain_strips_token_after_first_hop_and_verifies_sha256` also checks a valid digest. The digest is computed over bytes written and compared before destination commit. |
| CR-D18/D25 exact allowlist | PASS | The sole `ALLOWED_DOWNLOAD_HOSTS` list is exactly `api.github.com`, `github.com`, `objects.githubusercontent.com`, and `release-assets.githubusercontent.com`. `only_documented_github_hosts_and_https_port_443_are_accepted` accepts those four and rejects a deceptive suffix host and port 444. Every redirect is restricted to HTTPS port 443 and exact host equality; there is no wildcard or host expansion. |

Official documentation checked during this review: the [GitHub REST API release asset endpoint](https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28) says clients should handle both `200` and `302` for binary asset retrieval (current page lines 22–25 and status table lines 47–53). The [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) lists `release-assets.githubusercontent.com` under “Needed for downloading release assets” (current page lines 229–237). These confirm the recorded `200`/`302` behavior and the extra release-asset host. The other three hosts are the exact hosts already specified by CR-D25; no additional host was found in the cited docs to justify expansion.

## Suites

- `/Users/davidcardenas/.cargo/bin/cargo test -p gitcanvas-core releases::download::tests -- --test-threads=1` — **PASS**, exit 0; 11 passed, 0 failed, 119 filtered out.
- `/Users/davidcardenas/.cargo/bin/cargo test --workspace` — **PASS**, exit 0. Tauri library: 64 passed; `gitcanvas-core`: 129 passed, 1 ignored; actions: 18 passed; authors: 17 passed; remaining integration suites and doc-tests passed. No failures.
- `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` — **PASS**, exit 0.
- `/Users/davidcardenas/.cargo/bin/cargo fmt --all -- --check` — **PASS**, exit 0.
- `npm test && npm run lint` — **PASS**, exit 0; Vitest: 102 files and 963 tests passed; ESLint completed with zero warnings/errors.
- `npm run typecheck` — **PASS**, exit 0.
- `python3 .dcl/dcl.py doc-check` — **PASS**, output `doc-check: todo en orden`.
- `git diff --check 09f000cb605a7d341bc753e15208ff7e88280eb2..6c146c7e9e480a7b88a5cc33f715377004575e66` — **PASS**, exit 0.

## Límites y gates pendientes

- HTTP behavior is covered with loopback servers; no live GitHub asset download was performed.
- Linux and Windows were not tested (suggested gate: `V09-VERIFY-CR11B-PLATFORMS`).
- CR-11b core download was exercised directly. Native save-dialog and Tauri IPC behavior is a later CR-12 integration concern.
