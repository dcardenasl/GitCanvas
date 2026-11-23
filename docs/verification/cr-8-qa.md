# CR-8 task QA

**Verdict: PARTIAL**

Reviewed commit `35578926eae6030edb1cc6fb104f42f6cb9b77a4` against parent `af25e0155570e2cdf91ccd8422a91bac39dbe3fd` on macOS. The requested tag and pull behaviors have direct passing coverage. Case 38 is broader than this task's direct evidence, and the `fetch_tag` Tauri command that will enforce CR-7's write gate and common-directory lock is deferred to CR-12.

## Acceptance evidence

| Case | Result | Evidence |
| --- | --- | --- |
| 14: absent local tag | PASS | `fetch::tests::fetches_an_absent_tag_through_a_temporary_reference_then_cleans_it` asserts `Fetched`, local `refs/tags/v1.0` equals the remote object ID, and no temporary refs remain. |
| 15: same object | PASS | `an_equal_existing_tag_is_already_present_without_rewriting_it` asserts `AlreadyPresent`, target remains equal, and no temporary ref exists. |
| 16: different object | PASS | `a_different_existing_tag_conflicts_without_moving_the_local_tag` checks the exact local and remote target IDs, unchanged local ref, and no temporary ref. |
| 17: invalid/path tag | PASS | `invalid_tag_names_are_refused_before_remote_access` rejects `../secret`, `refs/heads/main`, `-x`, `a:b`, and `a b` through the validation helper. `fetch_tag` calls this validation before opening the repository or resolving a remote. |
| 19: unrelated tags on pull | PASS | `actions::pull_fetches_tags_for_new_commits_but_not_unrelated_remote_tags` uses a temporary bare remote over Git smart `git://`; the reachable tag arrives, while the unrelated tag does not. Pull sets `AutotagOption::Auto`. |
| 38: only approved writes | PARTIAL | Fetch tests assert no tag/temp-ref changes for equal, conflicting, and missing-remote outcomes, and temporary-ref cleanup after success. This task-level run did not snapshot all Git and filesystem state around every other action in the application, as the full case text requests. |
| 45: local ancestor conflicts | PASS | The different-object fixture puts the local tag on the base commit and the advertised remote tag on its descendant; the test asserts `Conflict` and unchanged local target. |
| 46: remote tag absent | PASS | `a_remote_tag_missing_from_the_local_repository_is_not_found_without_writes` asserts `NotFoundOnRemote`, no local tag, and no temporary refs. |

CR-D14's implementation follows the planned validate, inspect-local, list-remote, compare, temporary-fetch, non-forced-create, cleanup sequence. It uses `AutotagOption::None` for the explicit refspec. CR-D15 is implemented with `AutotagOption::Auto` and has the integration test above.

CR-7 integration is in place for existing `checkout`, `pull`, and `push` Tauri commands: each takes `runtime::write` before `with_repository_write_lock`. `fetch_tag` documents the same required ordering, but no Tauri command exists yet; the plan assigns IPC/bindings to CR-12. Therefore the fetch behavior itself passes core tests, while its eventual command-level gate/lock integration remains pending CR-12.

## Suites

Commands run at commit `3557892`:

- `/Users/davidcardenas/.cargo/bin/cargo test --workspace` — **PASS**, exit 0. Tauri library: 64 passed; `gitcanvas-core`: 102 passed, 1 ignored; `tests/actions.rs`: 18 passed; remaining integration/doc-test binaries passed (the `stash_inspection` suite had 24 passed, 1 ignored). No failures.
- `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` — **PASS**, exit 0.
- `/Users/davidcardenas/.cargo/bin/cargo fmt --all -- --check` — **PASS**, exit 0.
- `npm test && npm run lint` — **PASS**, exit 0; Vitest: 102 files and 963 tests passed; ESLint completed with zero warnings/errors.
- `npm run typecheck` — **PASS**, exit 0.
- `python3 .dcl/dcl.py doc-check` — **PASS**, output `doc-check: todo en orden`.
- `git diff --check af25e0155570e2cdf91ccd8422a91bac39dbe3fd..35578926eae6030edb1cc6fb104f42f6cb9b77a4` — **PASS**, exit 0.

## Límites y gates pendientes

- Case 38 needs a broader before/after state audit across the rest of the actions. Add a task/version verification gate for the full action matrix (suggested ID: `V09-VERIFY-CR8-WRITES`).
- Verify the eventual `fetch_tag` Tauri command acquires the write permit before the common-directory lock, and returns busy without side effects when either gate is occupied. This wiring is assigned to CR-12; verify it when that task lands (suggested ID: `V09-VERIFY-CR12-FETCH-TAG-LOCK`).
- The remote integration tests use local temporary remotes; no live GitHub request was made. Linux and Windows were not run (suggested platform gate: `V09-VERIFY-CR8-PLATFORMS`).
