# QA de seguimiento CR-15: matriz nativa y estabilidad E2E

Fecha: 2026-11-22. **Veredicto: PASS para los cambios de aserciones de layout, reintento stale y provisión de EdgeDriver en el diff `126b029..5cdc6dd`.** La corrida CI multiplataforma reportada aporta evidencia de ejecución nativa en Ubuntu, macOS y Windows. Este informe no cierra los gates de diálogo/renombrado real ni de lector de pantalla.

## Alcance y paquete recibido

- Plan de aceptación: `docs/plan/2026-11-16-v0.9-implementacion.md`, CR-15 y matriz de plataformas de `TASKS.md`.
- Baseline: `126b029c1628555ed6079b3ffcd1ffef101cc4f3`.
- Entrega revisada: `5cdc6dd6754c19e4c845bc1a084f692d1a37e97e`.
- Diff: workflow `quality.yml` y cuatro archivos E2E (`authors-releases.spec.ts`, `file-history.spec.ts`, `graph.spec.ts`, `interactions.ts`).
- Evidencia entregada por quien solicita la revisión: CI `quality.yml` run `45093960516` terminó success en Ubuntu/macOS/Windows, con tests Rust, Clippy, bundles y E2E nativo. No consulté directamente el proveedor CI; la atribución de esa corrida se basa en el identificador y resultado proporcionados y en la referencia del repositorio.
- Contexto ambiental: el árbol de trabajo ya contenía cambios y archivos no rastreados ajenos a este informe. El baseline del diff se conservó; no se modificaron esos elementos.

## Criterios revisados

| Criterio | Evidencia directa | Resultado |
|---|---|---|
| La prueba distingue dimensiones de ventana nativa y viewport del contenido. | `authors-releases.spec.ts` comprueba `browser.getWindowSize()` en 940×600 y mide overflow usando `window.innerWidth` y `document.documentElement.scrollWidth`; ya no afirma que el viewport sea exactamente 940 px. `graph.spec.ts` comprueba las dimensiones nativas y compara la altura del shell con `document.documentElement.clientHeight`, una medida del viewport. | PASS |
| El retry de un click stale no vuelve a hacer una acción cuya confirmación ya pasó. | En `clickAndConfirm`, `confirm()` ocurre antes del retorno; el reintento solo se evalúa si esa confirmación lanza error. Si la confirmación tiene éxito, retorna inmediatamente y no se hace segundo click. Si falla, solo reintenta cuando el selector aún está visible. | PASS con límite: no se añadió una prueba unitaria focalizada de la carrera «acción aplicada, confirmación agotó timeout»; en ese caso el reintento podría repetir el click si el elemento sigue visible. La garantía comprobada es no duplicar una acción ya confirmada. |
| EdgeDriver se instala usando la versión resuelta por el lockfile y deja su ejecutable disponible en PATH. | El workflow ejecuta `npm ci` antes del paso de instalación. El paso invoca `download()` del paquete `edgedriver` instalado, valida el código de salida y la ruta retornada, y agrega su directorio padre a `GITHUB_PATH`. El lockfile fija `edgedriver` 6.3.1; el paquete es dependencia transitiva de la versión de WDIO resuelta. | PASS |
| Los cambios superan validaciones locales entregadas. | Los cinco comandos siguientes se ejecutaron en esta revisión y pasaron. | PASS |
| Matriz nativa Linux/macOS/Windows. | Resultado CI `quality #45093960516` suministrado: success para los tres runners, incluidos E2E nativos. | PASS según evidencia CI suministrada; esta revisión no volvió a lanzar los jobs. |

## Suites

| Comando | Resultado observado |
|---|---|
| `npx eslint e2e/interactions.ts e2e/file-history.spec.ts` | PASS, exit 0, sin diagnósticos. |
| `npm run typecheck:e2e` | PASS, exit 0 (`tsc --noEmit -p tsconfig.e2e.json`). |
| `git diff --check` | PASS, exit 0, sin salida. |
| `python3 .dcl/dcl.py doc-check` | PASS, exit 0 (`doc-check: todo en orden`). |
| `npm run format:check` | PASS, exit 0 (`All matched files use Prettier code style!`). |
| CI `quality.yml` run `45093960516` (evidencia proporcionada) | PASS reportado en Ubuntu, macOS y Windows; incluye tests Rust, Clippy, bundles y E2E nativo. No se ejecutó nuevamente desde QA. |

## Hallazgos

No hay hallazgos bloqueantes para el alcance del diff. La condición del retry está ordenada correctamente: una confirmación exitosa finaliza el helper antes de cualquier segundo click. El manejo de EdgeDriver consume el paquete instalado por `npm ci` y valida que la descarga produjo una ruta existente antes de modificar el PATH del job.

## Límites y gates pendientes

- **`V09-VERIFY-CR15-DOWNLOAD-PLATFORMS` sigue abierto.** La matriz CI no equivale a ejercitar el diálogo nativo y el flujo real de renombrado/confirmación en macOS, Linux y Windows. Debe conservarse evidencia por plataforma antes de cerrar ese gate.
- **`A11Y-LECTOR` sigue abierto.** No se ejecutó navegación real con VoiceOver, NVDA u Orca; roles, estados DOM y E2E no sustituyen esa comprobación.
- No ejecuté la suite WDIO ni las suites Rust en este QA; la evidencia de matriz indicada arriba fue entregada como resultado de CI, no regenerada localmente.
- El retry de click stale no tiene en este diff una prueba focalizada de interacción que simule un click aplicado seguido de confirmación tardía/timeout. No impide aceptar el requisito pedido (no reintentar después de confirmación exitosa), pero limita la evidencia sobre esa carrera.
