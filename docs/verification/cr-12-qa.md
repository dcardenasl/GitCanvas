# CR-12 task QA

**Verdict: PASS**

Reviewed follow-up commit `af0af31b4f6bb076a57acc4935c54f4bcb7a07bb` against baseline `36a602e3065a3b667718e2e7d1c75ac8334d4708` on macOS. The follow-up directly closes the prior feasible test gaps. No implementation defect or remaining in-scope acceptance gap was found.

## Acceptance evidence

| Case / contract | Result | Evidence |
| --- | --- | --- |
| 35: commands authorize repository before provider/dialog work | PASS | `release_commands_reject_an_unopened_repository_before_provider_or_dialog_work` invokes all six release commands against an unallowed repository and expects `InvalidRepository`; command source authorizes before provider/dialog work. |
| 43: cancel responds with both transfer permits occupied | PASS | `cancel_transfer_returns_while_both_transfer_permits_are_occupied` holds both permits, invokes the real cancel command, verifies a sub-second return and the cancellation flag. |
| 43: token save is independent of transfer permits | PASS (gate mapping) | `store_github_token` is statically mapped to `write`, not `transfer`; `transfers_have_an_independent_two_permit_gate` proves writes complete while both transfer permits are occupied. The credential command itself is statically checked, not invoked. |
| 44: history read remains available during release transfer work | PASS (gate composition) | Runtime gate test occupies both transfer permits and completes a read while they remain held; static command-gate inspection maps history commands to `read` and release network commands to `transfer`. No live provider request is needed to exercise the gate contract. |
| 57: empty, one-item and paginated asset discovery; metadata-only descriptors | PASS | `published_release_with_no_assets_returns_an_empty_complete_list` covers empty discovery; `discovery_checks_release_then_returns_bounded_metadata_without_urls` verifies one item and only metadata fields; `metadata_ids_and_page_sizes_are_validated_and_capped` covers pagination. |
| 58: response/page bounds and truncation | PASS | Asset test enforces 100 items/page, ten pages/1,000 items, and truncated status; it asserts exactly the release check plus pages 1–10 and no page-11 request. The shared API client test covers the 8 MiB response limit. |
| 59: invalid IDs, missing/draft release, absent asset and cap behavior | PASS | Canonical ID tests reject malformed values; resolver tests reject wrong release, draft and absent asset. `absent_asset_after_the_full_thousand_item_bound_is_a_resource_error` asserts `ResourceLimitExceeded` for the absent target at the cap and confirms no page-11 request. |
| 60: REST URL validation and metadata redirects | PASS | `malformed_asset_urls_are_rejected_for_every_untrusted_component` exercises mutations to scheme, port, host, credentials, query, fragment, owner/repository/path and asset ID. `release_metadata_redirect_is_rejected_without_following` asserts redirects are rejected. |
| 61: fresh membership before download; frontend cannot supply URL/destination | PASS | Download IPC accepts repository path, release/asset IDs and transfer ID only. The resolver re-fetches the published release and asset pages, selects by membership and validates the matched REST URL before dialog/download. Tests cover membership and absent/mismatched/draft/hostile cases. |
| 62: one transfer gate per query/download; no nested gate | PASS | Static command invariants assign transfer once to network commands; download invokes the shared resolver directly rather than another gated IPC command. Runtime test covers transfer capacity and independent read/write availability. |
| 63: Offline/401/403/429 do not fall back to notes cache | PASS | `metadata_offline_and_access_errors_are_typed_without_cache_fallback` pre-populates valid cached notes, then verifies Offline, AccessRequired for 401/403, and RateLimited for 429, with only the metadata request made and no cached result returned. |
| 64: unauthorized IPC, pre-dialog cancellation/resolver error, binding contract | PASS | Unauthorized repository rejection is directly tested. `cancellation_before_resolution_skips_network_dialog_and_binary_work` and `rejected_asset_resolution_skips_dialog_and_binary_work` assert resolver/dialog/binary callbacks are skipped in the respective cases. Binding tests assert canonical decimal-string IDs; download args exclude URL, destination, size and digest. |
| 65: IDs preserve all u64 values | PASS | `canonical_ids_preserve_u64_and_reject_noncanonical_values` covers values above JavaScript's safe integer range and `u64::MAX`, plus invalid forms; serialization test asserts exact decimal strings. Cache/model representation remains unchanged. |
| Gate order and transfer/token behavior | PASS | Static invariants and source inspection confirm `fetch_tag` uses write gate before repository write lock, cached reads use read, network release commands use transfer, cancel has no runtime gate, and token storage uses write only. Download resolves fresh metadata and checks cancellation before dialog and binary stages. |

ADR 0013's DTO and URL ownership boundaries match the implementation. Metadata requests refuse redirects and use bounded responses. Binary downloads retain the CR-D25 host allowlist and manual redirect policy. Release IDs remain numeric internally and are serialized as strings at the IPC boundary.

## Suites

- `/Users/davidcardenas/.cargo/bin/cargo test -p gitcanvas-core releases::assets::tests -- --test-threads=1` — **PASS**, exit 0; 9 passed, 0 failed.
- `/Users/davidcardenas/.cargo/bin/cargo test -p gitcanvas --lib commands::releases::tests -- --test-threads=1` — **PASS**, exit 0; 6 passed, 0 failed.
- `/Users/davidcardenas/.cargo/bin/cargo test --workspace` — **PASS**, exit 0; Tauri library 73 passed; `gitcanvas-core` 140 passed, 1 ignored; actions 18 passed; authors 17 passed; all remaining integration suites and doc-tests passed; no failures.
- `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` — **PASS**, exit 0.
- `/Users/davidcardenas/.cargo/bin/cargo fmt --all -- --check` — **PASS**, exit 0.
- `npm test && npm run lint` — **PASS**, exit 0; Vitest reports 102 files and 963 tests passed; ESLint completed with `--max-warnings=0` and no output/errors.
- `npm run typecheck` — **PASS**, exit 0; `tsc --noEmit` completed without diagnostics.
- `npm run format:check` — **PASS**, exit 0; output `All matched files use Prettier code style!`.
- `python3 .dcl/dcl.py doc-check` — **PASS**, output `doc-check: todo en orden`.
- `git diff --check 36a602e3065a3b667718e2e7d1c75ac8334d4708..af0af31b4f6bb076a57acc4935c54f4bcb7a07bb` — **PASS**, exit 0, no output.

## Límites y gates pendientes

- No live GitHub request or manually operated native save-dialog session was performed; these are outside the local harness. No separate Linux or Windows run was performed. No additional in-scope gate is required by this review.
- The token save concurrency assertion uses static command-to-gate mapping plus the runtime gate independence test; `store_github_token` itself was not invoked because that would exercise credential verification/keychain/network behavior beyond this gate check.
