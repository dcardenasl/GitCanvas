# QA de CR-7: cerrojo de escritura y puerta de transferencia

**Veredicto: PASS** para CR-7 en macOS. Los casos 18, 39 y 40 tienen evidencia directa; el alcance del lock es deliberadamente intra-proceso según CR-D23.

## Alcance y evidencia

- Baseline de esta revisión: `b7ed0ecd2f7d6c6a4de55e5a6f5b020915d8683f`.
- Commit revisado: `c88393851735f4515986146e285aa6f3db5eb4e1` (`test(core): cover repository lock contention and abandonment`), hijo directo del baseline.
- Casos del plan: 18 (serialización de escrituras en worktrees enlazados dentro del proceso), 39 (checkout/pull/push ocupados por más de 2 s fallan sin efectos y operan tras liberar el lock), 40 (pánico/abandono libera el lock al terminar el trabajo). CR-D23/D24 requieren clave por `commondir` canónico, permiso de puerta antes del lock y puertas separadas.
- Sesión de QA: Claude Code autenticado con claude.ai Pro, modelo `claude-haiku-5-5`, esfuerzo medio, según `config/modelos.yaml`.
- Entorno: macOS (Darwin). `cargo` no estaba en el PATH inicial; se ejecutó con `/Users/davidcardenas/.cargo/bin/cargo`.
- El checkout tenía `SNAPSHOT.md` modificado y archivos no rastreados antes de la revisión. Se dejaron intactos.

| Criterio | Evidencia | Resultado |
| --- | --- | --- |
| Caso 18: worktrees enlazados comparten lock y serializan escrituras | `write_lock::tests::linked_worktrees_share_one_lock_and_writes_serialize` crea un repo y worktree enlazado, verifica la misma clave, observa que la segunda operación espera y que continúa al liberar el permiso. | Pasa dentro del proceso, como especifica CR-D23. |
| Caso 39: checkout/pull/push ocupados devuelven `RepositoryBusy` sin efectos | `repository_tests::git_action_commands_return_repository_busy_without_side_effects` invoca individualmente los tres comandos mientras el lock está retenido. Cada uno devuelve `RepositoryBusy`; HEAD permanece en `main` y `refs/heads/main` remota conserva su SHA. Tras liberar el lock, pull devuelve `UpToDate`, push devuelve `Pushed` y checkout devuelve `Switched`, actualizando HEAD a `topic`. | Pasa para las tres acciones, incluidas respuesta de busy, ausencia de efectos y recuperación. |
| Caso 40: abandono del llamador y liberación por RAII | `commands::runtime::tests::an_abandoned_started_blocking_write_keeps_its_lock_until_it_finishes` espera a que `spawn_blocking` entre en la sección protegida, llama `abort` y abandona el handle. La operación continúa; un contendor no adquiere el lock antes de la señal de liberación. Al terminar el closure, el contendor adquiere el lock. También sigue pasando `the_lock_is_released_after_error_and_panic`. | Pasa con la semántica documentada: cancelar/abandonar el handle no aborta trabajo `spawn_blocking` ya iniciado; el guard RAII libera el lock cuando el trabajo termina. |
| CR-D23: clave y orden de adquisición | `commondir()` canonicalizado identifica el repositorio común. Los comandos usan primero `runtime::write` (puerta) y después `with_repository_write_lock` antes de la acción. | Pasa por pruebas e inspección de la ruta de llamadas. La protección es solo intra-proceso, como permite el plan. |
| CR-D24: puertas independientes | Pruebas de runtime verifican límites de concurrencia y que saturar transferencias no bloquea lecturas ni escrituras. La puerta de transferencia define 2 permisos y 30 s. | Pasa. Los comandos de releases se conectan a esta puerta en CR-12. |

## Suites

| Comando | Resultado |
| --- | --- |
| `/Users/davidcardenas/.cargo/bin/cargo test --workspace` | Código 0. `gitcanvas`: 64 pasaron; `gitcanvas-core`: 91 pasaron, 1 ignorada; integraciones y doc-tests pasaron. El test ignorado es el benchmark de 10.000 commits de `file_history`, ajeno a CR-7. |
| `/Users/davidcardenas/.cargo/bin/cargo test -p gitcanvas --lib an_abandoned_started_blocking_write_keeps_its_lock_until_it_finishes` | Código 0. 1 prueba pasó; 63 filtradas. |
| `/Users/davidcardenas/.cargo/bin/cargo test -p gitcanvas --lib git_action_commands_return_repository_busy_without_side_effects` | Código 0. 1 prueba pasó; 63 filtradas. |
| `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` | Código 0. Sin advertencias. |
| `/Users/davidcardenas/.cargo/bin/cargo fmt --all -- --check` | Código 0. Sin cambios requeridos. |
| `npm test` | Código 0. 102 archivos y 962 pruebas pasaron. |
| `npm run lint` | Código 0. ESLint terminó sin hallazgos. |
| `npm run typecheck` | Código 0. TypeScript terminó sin errores. |
| `python3 .dcl/dcl.py doc-check` | Código 0. Salida: `doc-check: todo en orden`. |
| `git diff --check b7ed0ec..c883938` | Código 0. Sin salida; no detectó errores de whitespace. |

## Hallazgos

No hay hallazgos abiertos para los casos 18, 39 y 40. Las pruebas nuevas cierran la cobertura por acción y explicitan el ciclo de vida de un `spawn_blocking` abandonado. `TASKS.md` ahora describe que un trabajo iniciado continúa y que el lock se libera al terminar, sin afirmar que se cancele el trabajo bloqueante.

## Límites y gates pendientes

- No se ejecutó en Linux ni Windows; esta revisión y sus pruebas corrieron en Darwin. La verificación de esas plataformas queda para la matriz de CI de release.
- Gate propuesto: **V09-VERIFY-CR7-PLATFORMS**, ejecutar los casos de lock y los checks de Rust en Linux y Windows antes de cerrar la matriz de plataforma de release.
- El lock es deliberadamente local al proceso. No serializa escrituras de otro proceso; el plan delega esa protección a los lockfiles de Git/libgit2. No es un hallazgo contra el criterio.
