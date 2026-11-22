# CR-14b task QA

**Verdict: PASS**

Independently reviewed commit `d334011` against baseline `ccb448f` on macOS. Scope: plan cases 25 and 36, the changed panel/sidebar/state code and direct tests, and the Constructor's reported results. No in-scope implementation defect was found.

## Acceptance evidence

| Case / contract | Result | Evidence |
| --- | --- | --- |
| 25: cached release list and capture date | PASS | The panel renders `cached_at` with the active i18n locale. Existing component test `labels cached release data with its capture time` verifies the localized date notice. The query consumes `useReleases`, whose backend response carries cache data when available. |
| 25: no cache while offline | PASS | `presents typed offline errors instead of inventing a release list` supplies `Offline`, verifies the user-facing offline error, and asserts no release list is fabricated. The panel also offers an explicit retry instead of silently retrying. |
| 36: explicit tag fetch and local-state refresh | PASS | `fetches a selected release tag through the typed mutation` clicks the explicit `Traer v1.0` action and asserts only that tag is sent to the typed mutation. Source invalidates Git metadata and release query after `Fetched`; tag actions are unavailable when local tag status is unknown. |
| 36: fresh asset lookup and Rust-owned download destination | PASS | Expanding a release calls the release-assets query for the selected decimal release ID. The download hook receives only `releaseId`, `assetId`, and generated `transferId`; no URL or destination is supplied. Exact large asset ID `9007199254740993` is preserved in the direct UI test. CR-12 owns the Rust dialog and final membership/URL checks. |
| 36: progress and cancellation | PASS | The component renders byte counts in a live status and a labelled progress bar; the direct interaction test checks `50 de 100 bytes`, clicks cancel and asserts cancellation targets the exact active transfer ID. |
| 36: AccessRequired recovery without unsafe replay | PASS | The token flow calls the token command, clears the secret from component state, then resumes the same pending tag action only if panel/root context is unchanged. Tests verify same-repository replay and that an action with discarded context is not replayed, instead offering explicit retry. For downloads, saving access never auto-replays; the test verifies exactly one attempt until the user clicks download again, with the same exact IDs and a new transfer ID supplied by the UI. |
| 36: typed errors and accessible status semantics | PASS for observable UI behavior | Loading, cache, errors, transfer progress, and outcomes use named controls and status/alert/live-region semantics; cancel/fetch/download are native buttons. These are directly queryable in component tests. A real screen-reader session remains an external gate. |

The component keeps repository and panel visibility in the active context. Sidebar keys the component by repository and hidden state; collapsing it clears the token and unmounting discards its local state. The progress listener is subscribed only in Tauri runtime and while the panel is active.

## Suites

- `npm test -- src/components/TagsReleasesPanel/TagsReleasesPanel.test.tsx src/components/Sidebar/Sidebar.test.tsx` — **PASS**, exit 0; 2 files, 40 tests passed.
- `npm test` — **PASS**, exit 0; Vitest: 104 files and 986 tests passed.
- `npm run lint` — **PASS**, exit 0; ESLint ran with `--max-warnings=0` and no diagnostics.
- `npm run typecheck` — **PASS**, exit 0; `tsc --noEmit` completed without diagnostics.
- `npm run format:check` — **PASS**, exit 0; `All matched files use Prettier code style!`.
- `python3 .dcl/dcl.py doc-check` — **PASS**, exit 0; `doc-check: todo en orden`.
- `git diff --check ccb448f..d334011` — **PASS**, exit 0, no output.

CR-14b changes frontend files only; Rust was not rerun as part of this task.

## Límites y gates pendientes

- No request was sent to live GitHub and no native save dialog was manually operated. The mocked IPC tests verify frontend arguments/flow; CR-12 covers the Rust download boundary separately.
- A real screen-reader pass was not performed. The existing A11Y-LECTOR / CR-15 gate remains open; no screen-reader result is claimed here.
