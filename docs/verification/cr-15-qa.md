# CR-15 task QA

**Verdict: PARTIAL**

Independently reviewed commit `b651384` against baseline `f30fdb3` on macOS. Scope: plan cases 36/37, `e2e/authors-releases.spec.ts`, the fixture/config/runner diff, and the Constructor's exact command evidence in `TASKS.md`. Frontend verification passes. Native WDIO was not executed because the required release binary build failed for lack of disk space, and the authored spec does not exercise real release data/actions even if run.

## Acceptance evidence

| Case / contract | Result | Evidence |
| --- | --- | --- |
| 36: author keyboard, focus and accessible state | PARTIAL | Spec covers search label, author `aria-pressed`, Tab sequence through author/previous/next controls, declared Alt+Arrow shortcuts, Alt+Left navigation, selected commit, and polite catalog progress. Component tests cover keyboard/focus/ARIA/progress as recorded by CR-6a. The native WDIO spec was not run; no real screen-reader interaction is asserted. |
| 36: release actions, progress, cancellation and access recovery in the native app | PARTIAL | CR-14a/b component tests exercise these UI flows with mocked IPC, but this WDIO spec's fixture has no supported GitHub remote. It expects the translated unsupported-remote message in the release panel, so it does not run real release listing, tag fetch, assets/download, access recovery, or release progress/cancellation end to end. |
| 37: EN/ES × light/dark at 940×600 | PARTIAL | Spec loops through all four combinations, checks viewport width and that document width does not exceed it, and writes screenshots under `os.tmpdir()`. WDIO was not executed; therefore none of those combinations or screenshots were observed/reviewed. It checks horizontal overflow only, not a full visual review of all layout overflow. |
| CR-15 fixture integrity and no checked-in binaries | PASS by inspection | The new fixture creates a temp Git repository with three deterministic commits (Ada twice, Grace once) and a local tag. Existing ownership marker validation protects fixture cleanup; screenshots target the OS temp directory. No binary assets were added to the commit. |
| Plan's download rename check on three platforms | NOT VERIFIED | Constructor evidence states no platform-native rename/overwrite run and no CI evidence is claimed. The spec contains no download-renaming scenario. |

### Native build and E2E evidence

The recorded command was `/Users/davidcardenas/.cargo/bin/cargo build --release --features e2e,tauri/custom-protocol`. The first attempt failed while compiling `objc2-app-kit` with `No space left on device`; the recorded free space was 162 MiB and `target/` was 12 GiB. An incremental retry with 483 MiB free failed writing `target/release/.fingerprint/tauri-03128a4b80801d56/lib-tauri`, again for lack of space. This QA independently observed 406 MiB available on the filesystem and `target/` at 12 GiB, so did not repeat the native build. Consequently `GITCANVAS_E2E_FIXTURE_KIND=authors-releases npx wdio run ./wdio.conf.ts --spec e2e/authors-releases.spec.ts` was not run and no screenshot was generated or reviewed.

The fixture contains no configured origin; the release panel is expected to show `UnsupportedSource`. This avoids live GitHub access, but it also means this is not E2E coverage of actual release UI flows. The existing mocked IPC component tests are useful lower-level evidence and are not described as native E2E.

## Suites

- `npm run build` — **PASS**, exit 0; Vite transformed 328 modules and built `dist`. Vite emitted a non-blocking warning that the main chunk is larger than 500 kB after minification.
- `npm test` — **PASS**, exit 0; Vitest: 104 files and 986 tests passed.
- `npm run lint` — **PASS**, exit 0; ESLint `--max-warnings=0`, no diagnostics.
- `npm run typecheck` — **PASS**, exit 0; `tsc --noEmit` completed without diagnostics.
- `npm run typecheck:e2e` — **PASS**, exit 0; E2E TypeScript check completed without diagnostics.
- `npm run typecheck:node` — **PASS**, exit 0; Node/config TypeScript check completed without diagnostics.
- `npm run format:check` — **PASS**, exit 0; `All matched files use Prettier code style!`.
- `python3 .dcl/dcl.py doc-check` — **PASS**, exit 0; `doc-check: todo en orden`.
- `git diff --check f30fdb3..b651384` — **PASS**, exit 0, no output.
- Native `cargo build ...` — **FAIL due to environment disk exhaustion**, as detailed above; not rerun in this QA.
- WDIO authors/release spec — **NOT RUN** because its native build prerequisite failed.

## Límites y gates pendientes

- **Propose `V09-VERIFY-CR15-NATIVE-E2E`:** free sufficient disk, build the native E2E binary, run the authors/releases WDIO spec and inspect the four generated screenshots. Extend the harness or provide a local simulated release backend before claiming actual release flows are covered; the current fixture verifies only the unsupported-remote state for releases.
- **Propose `V09-VERIFY-CR15-DOWNLOAD-PLATFORMS`:** execute the planned download rename/overwrite checks on macOS, Linux and Windows and retain CI/manual evidence.
- Real VoiceOver/NVDA/Orca usage remains under the existing `A11Y-LECTOR` gate. No native E2E, screenshot review, release backend E2E, three-platform rename check, or real screen-reader result is claimed as complete.
