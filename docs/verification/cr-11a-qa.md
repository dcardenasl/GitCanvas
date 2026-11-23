# CR-11a task QA

**Verdict: PASS**

Reviewed commit `23e66ee56eb2e78108c7beb897e253ad4f2eb100` against parent `d02194beb9cbca232d18f8344270d2c10219193a` on macOS.

## Acceptance evidence

| Case | Result | Evidence |
| --- | --- | --- |
| 29: normal download/progress/final bytes/temp cleanup | PASS | `normal_download_reports_progress_and_atomically_writes_exact_bytes` asserts `Completed`, exact file bytes, initial zero and final progress counts, and no `.tmp*` file remains. The transfer uses a same-directory `NamedTempFile` and atomic persist. |
| 30: cancellation | PASS | `cancellation_and_a_path_appearing_during_download_leave_no_partial_file` flips the cancellation flag after receiving bytes and asserts `Cancelled`, no destination, and no temporary file. |
| 31: existing destination | PASS for core contract | `insufficient_space_and_unconfirmed_existing_destination_do_not_request_or_write` asserts an existing file without `overwrite_confirmed` returns `Conflict` and preserves bytes. The user-facing native confirmation prompt itself is invoked in the later CR-12 command layer. |
| 34: size and free-space limits | PASS | `api_size_content_length_and_received_bytes_each_enforce_the_cap` independently rejects the API size, response `Content-Length`, and bytes copied over an injected cap. `insufficient_space_and_unconfirmed_existing_destination_do_not_request_or_write` verifies low free space rejects before request/write. Tests inject a small limit rather than creating a 1 GiB fixture. |
| 47: hostile suggested filename | PASS | `filename_sanitization_handles_traversal_windows_names_and_length` verifies traversal separators are neutralized, `CON.txt` is prefixed, blank names fall back to `release-asset`, and output length is at most 180 characters. |
| 48: symlink / destination appears after selection | PASS with platform limit | `confirmed_regular_destinations_can_be_replaced_but_symlinks_are_refused` rejects a symlink without changing its target (`cfg(unix)`). The cancellation/race test creates the destination after selection, then asserts `Conflict`, preserved bytes, and no temp residue. `persist_noclobber` is used for a previously absent target. |
| CR-D27 and capability | PASS for core; dialog wiring pending | `download_asset` accepts a Rust-selected path, validates the parent and target with `symlink_metadata`, writes a temp file in the destination directory, rechecks the final component, and does not overwrite an unconfirmed or newly appearing target. `dialog:allow-save` is present in the default capability and the dialog plugin is registered. CR-11a does not invoke the native dialog; CR-12 owns that command integration. |
| Transfer gate | PASS for this core task | `download_asset` has no runtime/transfer-gate acquisition. No Tauri command yet invokes this API; CR-12 must use the transfer gate when it wires the command. |

Redirect validation, approved hosts, and digest verification are CR-11b scope and were not treated as CR-11a acceptance.

## Suites

- `/Users/davidcardenas/.cargo/bin/cargo test --workspace` — **PASS**, exit 0. Tauri library: 64 passed; `gitcanvas-core`: 124 passed, 1 ignored; actions: 18 passed; authors: 17 passed; remaining integration suites and doc-tests passed. No failures.
- `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` — **PASS**, exit 0.
- `/Users/davidcardenas/.cargo/bin/cargo fmt --all -- --check` — **PASS**, exit 0.
- `npm test && npm run lint` — **PASS**, exit 0; Vitest: 102 files and 963 tests passed; ESLint completed with zero warnings/errors.
- `npm run typecheck` — **PASS**, exit 0.
- `python3 .dcl/dcl.py doc-check` — **PASS**, output `doc-check: todo en orden`.
- `git diff --check d02194beb9cbca232d18f8344270d2c10219193a..23e66ee56eb2e78108c7beb897e253ad4f2eb100` — **PASS**, exit 0.

## Límites y gates pendientes

- Exercise native save-dialog confirmation and command-level transfer-gate behavior when CR-12 exposes this core API.
- Symlink behavior is directly tested on Unix only; this run was macOS. Windows and Linux were not run. Validate no-clobber/rename semantics on all release platforms (suggested gate: `V09-VERIFY-CR11A-PLATFORMS`).
- No live download provider was used; HTTP behavior uses loopback test servers. CR-11b's redirect and digest checks remain outside this task.
