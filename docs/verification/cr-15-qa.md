# CR-15 task QA

## Follow-up QA: ajustes de E2E nativo (2026-11-22)

**Veredicto del seguimiento: PARTIAL para CR-15; PASS para las suites ejecutadas y los cambios de harness incluidos en este alcance.** Se revisó el diff no comprometido de `e2e/local-changes.spec.ts`, `e2e/stash.spec.ts`, `e2e/workspace.spec.ts`, `src/App.css` y `crates/gitcanvas-core/tests/worktree.rs`, contra los criterios 36–37 del plan v0.9 y la matriz de `docs/verification/v0.9.md`. No se revisaron otros cambios del árbol. Plataforma observada: macOS/WebKit 605.1.15.

### Criterios revisados

| Criterio | Resultado | Evidencia y límite |
| --- | --- | --- |
| Estabilidad de E2E de cambios locales | PASS | `local-changes.spec.ts` pasó 3/3. El spec espera los fixtures iniciales, fija idioma español, comprueba que el archivo y el índice staged contienen el nuevo texto y espera la actualización del diff dentro del intervalo de polling. La regresión cubre un cambio staged mientras la vista del diff está abierta. |
| Layout y scroll en stash | PASS en macOS | `stash.spec.ts` pasó 6/6, incluido 940×600 en cuatro combinaciones idioma/tema. Comprueba que la ventana no se desplaza con la rueda, raíz y body no desbordan verticalmente y sidebar/detalle sí permiten scroll interno. No prueba gestores de ventana ni plataformas distintas. |
| Workspace tras resize | PASS en macOS | `workspace.spec.ts` pasó 3/3. El resize usa una pausa del runner WDIO en lugar de depender de callbacks de página durante el resize nativo. |
| Fingerprint de contenido staged | PASS | La prueba Rust añadida `fingerprint_changes_when_staged_content_is_updated` pasó 1/1. Verifica que actualizar el contenido staged cambia la revisión y que el diff staged devuelve el texto actualizado. |
| Caso 36: accesibilidad, lector y acciones de releases | PARTIAL | El conjunto WDIO completo pasó y los controles de autores/releases existentes se ejercitaron en macOS. Esto no verifica VoiceOver/NVDA/Orca ni el diálogo real de guardar. Los casos de acciones/releases no convierten el stub de diálogo en una comprobación del diálogo nativo. |
| Caso 37: EN/ES, claro/oscuro a 940×600 | PASS acotado a macOS | Los specs WDIO reportados pasaron en WebKit/macOS; `stash` confirma explícitamente las cuatro combinaciones a 940×600. No hay evidencia de Linux o Windows ni de validación con lector. |
| Renombrado/no sobrescritura en tres plataformas | NO VERIFICADO | Ninguna de las pruebas ejecutadas usa el diálogo real ni verifica este flujo en macOS, Linux y Windows. |

### Suites

| Comando | Resultado |
| --- | --- |
| `PATH=/Users/davidcardenas/.cargo/bin:$PATH npm run test:e2e` | PASS, exit 0. Build de frontend y suite WDIO completa; 13 archivos de spec/41 declaraciones de test, incluyendo `local-changes` 3/3, `stash` 6/6 y `workspace` 3/3. También pasaron `graph-performance` 1/1, `graph` 3/3 y `authors-releases` 4/4. |
| `npm run typecheck:e2e` | PASS, exit 0; TypeScript E2E sin diagnósticos. |
| `PATH=/Users/davidcardenas/.cargo/bin:$PATH cargo test --release -p gitcanvas-core --test worktree fingerprint_changes_when_staged_content_is_updated` | PASS, exit 0; 1 passed, 12 filtradas. |
| `git diff --check` | PASS, exit 0; sin salida. |

El build Vite pasó y produjo el aviso ya conocido de chunk principal de 564.68 kB (>500 kB); no bloqueó la suite. Durante WDIO se registró un warning de `tauri-service` al limpiar mocks (`A sessionId is required`), pero los specs reportaron PASS y el comando terminó exit 0.

### Límites y gates pendientes

- **`A11Y-LECTOR`:** no hubo sesión real con VoiceOver, NVDA u Orca. Roles, foco DOM y pruebas WDIO no sustituyen esa comprobación.
- **`V09-VERIFY-CR15-DOWNLOAD-PLATFORMS`:** probar el diálogo real, renombrado y no sobrescritura en macOS, Linux y Windows. No se ejecutó en ninguna matriz multiplataforma con este seguimiento.
- No se hizo una petición ni descarga contra GitHub real; los recorridos de releases usan datos sintéticos/locales.
- El resultado de E2E es una ejecución nativa de macOS/WebKit. No atribuirlo a Linux ni Windows.

Este seguimiento reemplaza la afirmación histórica de que el WDIO completo no había pasado: en estas corridas pasó. El gate `V09-VERIFY-CR15-NATIVE-E2E` quedó marcado PASS en `TASKS.md`; los límites externos (diálogo/Tab nativos y lector) permanecen separados. El veredicto de CR-15 permanece **PARTIAL** hasta resolver los gates externos indicados.

## Revisión inicial: alcance y estado a la fecha del primer dictamen

**Veredicto inicial: PARTIAL.** Este dictamen refleja el momento en que se emitió:
el build nativo aún fallaba por falta de espacio y no se había ejecutado WDIO. El
seguimiento de esta misma página, fechado 2026-11-22, incorpora la evidencia posterior
y es la fuente del estado vigente.

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

## Límites registrados en el dictamen inicial

- **Estado histórico de `V09-VERIFY-CR15-NATIVE-E2E`:** inicialmente se propuso liberar disco, compilar el binario y ejecutar WDIO. El seguimiento superior demuestra que ese gate ya pasó en macOS/WebKit, con el harness loopback de releases.
- **Propose `V09-VERIFY-CR15-DOWNLOAD-PLATFORMS`:** execute the planned download rename/overwrite checks on macOS, Linux and Windows and retain CI/manual evidence.
- Real VoiceOver/NVDA/Orca usage remains under the existing `A11Y-LECTOR` gate. El diálogo nativo y el renombrado en las tres plataformas siguen sin evidencia.

## Estado vigente tras el seguimiento del 2026-11-22

El dictamen vigente es **PARTIAL para CR-15**: `V09-VERIFY-CR15-NATIVE-E2E` pasa en
macOS/WebKit (13 specs/41 tests, exit 0); siguen pendientes `A11Y-LECTOR` y
`V09-VERIFY-CR15-DOWNLOAD-PLATFORMS`. La matriz v0.9 también espera la verificación
nativa de Linux y Windows. El stub E2E no se cuenta como diálogo de sistema real.
