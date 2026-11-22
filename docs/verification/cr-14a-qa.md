# CR-14a task QA

**Verdict: PASS**

Independently reviewed commit `daa1cad` against baseline `aaac35a` on macOS. Scope: plan acceptance cases 22, 24, 36, 51, and 54; the task diff; direct tests; and the Constructor's reported commands/results. No implementation defect or in-scope acceptance gap was found.

## Acceptance evidence

| Case / contract | Result | Evidence |
| --- | --- | --- |
| 22: unify local and remote release/tag state | PASS | `shows backend-joined releases and unmatched local tags in one list` renders one list with a release whose tag is local (`Disponible en el repositorio local`), a remote release with no matching local tag (`Disponible para traer`), and a local-only tag. Component renders the backend's tagged union and local-tag status without deriving Git refs from release metadata. |
| 24: notes remain inert text | PASS | `renders release notes as inert text, never as HTML or active links` supplies provider text containing `<img>` and `<a>`, then asserts it is a paragraph, contains no image/link elements, creates no document image, and exposes no links. React renders the notes string as text. |
| 36: observable panel and state semantics | PASS for this task's panel scope | The panel is a labelled `section`, its native toggle is a named `button` with `aria-expanded` and `aria-controls`, the list has an accessible name, and loading/cache/rate-limit/local-tag/empty/truncated states use `role="status"`. Component tests query the button/list/status roles and verify cache and local-tag warning text. Native button semantics provide keyboard activation. Full screen-reader behavior remains under the existing accessibility gate. |
| 51: local-tag enumeration unavailable above the limit | PASS | `announces when local tags could not be read` supplies `local_tags_available: false`, verifies the warning, preserves visible releases, and marks each release's local status unavailable rather than falsely labeling it absent/available to fetch. |
| 54: releases do not become graph/history references or navigation state | PASS | `keeps release entries out of Git reference and navigation state` places a release-only tag in the panel, asserts it is not exposed as a reference button, and confirms navigation selection and reference filters remain unchanged. Source/import inspection confirms the new panel is integrated in Sidebar and does not feed graph/history state. |
| Locale and captured-cache date | PASS for static locale catalogs and tested locale | EN and ES release catalogs contain the panel/status labels; rendering tests verify Spanish strings and format the cached timestamp using the active resolved locale. Runtime switching to English is not separately exercised here; EN/ES visual verification belongs to case 37/CR-15. |

The cache notice formats `cached_at` using `Intl.DateTimeFormat` and the active i18n language. The tests also cover loading, empty results, and sidebar integration. `local_tags_available: false` explicitly distinguishes unavailable local status from a tag known to be absent.

## Suites

- `npm test -- src/components/TagsReleasesPanel/TagsReleasesPanel.test.tsx src/components/Sidebar/Sidebar.test.tsx` — **PASS**, exit 0; 2 files, 34 tests passed.
- `npm test` — **PASS**, exit 0; Vitest: 104 files and 980 tests passed.
- `npm run lint` — **PASS**, exit 0; ESLint ran with `--max-warnings=0` and no diagnostics.
- `npm run typecheck` — **PASS**, exit 0; `tsc --noEmit` completed without diagnostics.
- `npm run format:check` — **PASS**, exit 0; `All matched files use Prettier code style!`.
- `python3 .dcl/dcl.py doc-check` — **PASS**, exit 0; `doc-check: todo en orden`.
- `git diff --check aaac35a..daa1cad` — **PASS**, exit 0, no output.

Rust was not modified by CR-14a and was not rerun for this task.

## Límites y gates pendientes

- A live screen-reader session was not performed. The existing `A11Y-LECTOR` / CR-15 gate remains the required manual verification for VoiceOver, NVDA, or Orca; no screen-reader result is claimed here.
- No runtime language-switch or 940×600 visual capture was performed; those checks are tracked under case 37 / CR-15, outside CR-14a's acceptance cases.
