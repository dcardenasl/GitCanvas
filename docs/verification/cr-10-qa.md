# CR-10 task QA

**Final verdict: PASS**

Re-reviewed follow-up commit `c80973fbd0272acb8e574a348ad13b44b7769478` against baseline `2e5326fa403a50a948572732ef10d340efd5aa5c` on macOS. The follow-up closes the prior case 28 gap.

## Acceptance evidence

| Case / contract | Result | Evidence |
| --- | --- | --- |
| 25: offline with cache / without cache | PASS | `offline_and_rate_limited_queries_serve_cache_with_current_local_tags` first stores a successful response, then uses an unreachable local endpoint and asserts a cached result with `cached_at`. `offline_without_a_cache_preserves_the_offline_error` asserts `AppError::Offline` when no entry exists. |
| 26: 50 repositories / 20 MiB, oldest eviction, clone cache untouched | PASS | Cache unit tests fill the 50-entry limit then store one more and assert the oldest is gone; the byte-cap test stores two 12 MiB entries and checks oldest eviction under the 20 MiB budget. `releases/cache.rs` exclusively uses `<data_dir>/releases`, accepts only safe `owner__repo.json` entries, and never opens the clone-cache directory. The implementation also filters symlinks and non-regular entries during eviction. |
| 28: RateLimited reset and cache fallback | PASS | `ReleaseList.rate_limit_reset` carries the reset from `AppError::RateLimited { reset }` alongside cached data. `offline_and_rate_limited_queries_serve_cache_with_current_local_tags` directly asserts ordinary offline fallback has `rate_limit_reset == None`, while the 429 fallback includes `Some("12345")`; the API status test verifies that same reset header is mapped to `AppError::RateLimited { reset: Some("12345") }`. |
| CR-D19: provider-only cache, no secrets, unknown/corrupt schema miss | PASS | `StoredReleaseData` persists only version, `ReleaseSource`, provider `ReleaseInfo` values, `truncated`, and capture timestamp—no token or local tag snapshot. `stores_and_loads_provider_data_with_capture_time_and_no_local_tag_snapshot` checks the data round-trip. `unknown_or_corrupt_entries_are_cache_misses` checks invalid JSON and unknown schema version. |
| Atomic write and caps | PASS | `store` serializes under an exclusive lock, writes to a same-directory temporary file, calls `sync_all`, then persists it to the target. Tests cover repository-count eviction, byte-budget eviction, replacement, and an entry too large to fit. |
| Fresh local tags on cached response | PASS | `offline_and_rate_limited_queries_serve_cache_with_current_local_tags` caches release metadata, adds a local `v2.0` tag after caching, then asserts the offline/rate-limited response joins that current tag and still includes the current unmatched `v1.0` tag. |

## Suites

- `/Users/davidcardenas/.cargo/bin/cargo test --workspace` — **PASS**, exit 0. Tauri library: 64 passed; `gitcanvas-core`: 118 passed, 1 ignored; actions: 18 passed; authors: 17 passed; blob: 7 passed; clone cache: 17 passed; workspace: 27 passed; worktree: 12 passed; worktrees: 4 passed; remaining integration suites and doc-tests passed. No failures.
- `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` — **PASS**, exit 0.
- `/Users/davidcardenas/.cargo/bin/cargo fmt --all -- --check` — **PASS**, exit 0.
- `npm test && npm run lint` — **PASS**, exit 0; Vitest: 102 files and 963 tests passed; ESLint completed with zero warnings/errors.
- `npm run typecheck` — **PASS**, exit 0.
- `python3 .dcl/dcl.py doc-check` — **PASS**, output `doc-check: todo en orden`.
- `git diff --check 2e5326fa403a50a948572732ef10d340efd5aa5c..c80973fbd0272acb8e574a348ad13b44b7769478` — **PASS**, exit 0.

## Límites y gates pendientes

- No remaining CR-10 acceptance gap identified in this re-review.
- The local HTTP fake covers behavior; no live GitHub request was made. The release-cache API is not yet exposed through IPC in this task, so no Tauri command integration was tested (IPC is a later task).
- Linux and Windows were not tested (suggested gate: `V09-VERIFY-CR10-PLATFORMS`).
