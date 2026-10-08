# Plan de endurecimiento de GitCanvas (auditoría completa)

## Contexto

Auditoría estática de las tres capas (núcleo Rust, shell Tauri + CI + docs, frontend React).
Las reglas duras de CLAUDE.md se cumplen en lo esencial: cero `unwrap`/`expect`/`panic!`,
sin `any`, `graph-layout` aislado y con cobertura completa, todos los comandos pasan por
`spawn_blocking`, el estado no guarda `Repository`, CSP estricta. Los problemas están en
los bordes: límites sin acotar, carreras, errores mal clasificados, reglas "que no se
negocian" pero sin guardia automática, tests que no prueban lo que dicen, duplicación y
documentación desfasada.

Objetivo: cerrar esos huecos sin reabrir decisiones ya tomadas del plan rector.

Convenciones de ejecución (CLAUDE.md): todo en `dev`, un commit por unidad, una línea en
inglés, sin trailers ni menciones a IA, archivos nombrados uno por uno, CHANGELOG solo para
`feat/fix/perf`, cada tarea nueva registrada en `TASKS.md` en el mismo commit
(nueva fase **H2 — Endurecimiento post-auditoría**). Un hallazgo no verificado en el
código antes de tocarlo se descarta si no se reproduce.

## Fase 0 — Desbloquear (inmediato)

1. `brag-output/` sin trackear hace fallar `prettier --check` y por tanto **todo commit**.
   Añadirlo a `.gitignore`, `.prettierignore` y `ignores` de `eslint.config.js`
   (o moverlo fuera del repo). Verificar `./pre-commit` en verde.

## Fase 1 — Correctitud y seguridad (alta)

Núcleo Rust (`crates/gitcanvas-core/src`):
- `diff.rs` `get_commit_diff` (A1): tope agregado de bytes/ficheros y marca `TooLarge`;
  idealmente resúmenes + parche por fichero bajo demanda (reutilizar `FileDiffSummary`).
- `worktree.rs` (A2): rechazar symlinks (o tratarlos como su texto), nada bajo `.git`,
  re-verificar tras abrir, usar `active.path()` en vez de `repo.workdir()`. Test de
  symlink interno.
- `watch.rs` (M1): clasificar con `strip_prefix(metadata)`; test con repo bajo dir `refs`.
- `github/api.rs` (M5): `ureq::Agent` con `timeout_global`/`timeout_connect`; 403 con
  rate-limit y 429 distintos de 401; señalar truncado a 1000 repos. `with_base_url` pasa a
  `#[cfg(feature = "test-support")]`/`doc(hidden)` y valida https salvo loopback (M4).
- `github/clone.rs` (M2/B11) y `cache.rs` (M3): lock por entrada y parcial único;
  retención que acumula errores y no borra clones en uso.
- `blob.rs`/`worktree.rs` (M6): comprobar `blob.size()` antes de `content()`.
- `error.rs` (M7): variantes `Auth`, `Network`, `Conflict`; centralizar `From`
  (incluido `keyring::Error`) y un helper `from_git2_remote`. Propagar a `actions.rs`,
  `clone.rs`, `credentials.rs`, `api.rs` y a `src/lib/errors.ts` (`KIND_SUMMARY`).
- `actions.rs` (M8): pull con `reference_matching`.
- `history.rs`: guarda en `insert` (bucle latente); `retry.rs`: shift saturado.

Shell Tauri (`src-tauri/src`):
- `commands/watch.rs` (M1/M2): soltar el watcher dentro de `runtime::write`/`spawn_blocking`;
  `unwatch` invalida `desired_generation`.
- `runtime.rs` (M3/M4): `list_github_repositories` por gate de lectura; timeout de permiso.
- Allowlist de repos (M5): `AllowedRepos` poblado por `open_repository`,
  `get_startup_repository` y clone, más helper `with_repo(path, op, f)` que además
  elimina la repetición de 14 comandos (B6). Reformular la regla 7 si no se adopta.
- `commands/github.rs` (M6): `trim()` del token en backend y frontend; `has_github_token`
  devuelve `Result<bool>` (B2).
- Reformular regla 10 ("nunca sale del backend; solo entra una vez").

Frontend (`src/`):
- `DiffViewer/parse.ts`: descartar cabeceras solo antes del primer `@@`; test con `-- x`.
- `FileDiffView.tsx`: unificar expansión (`expandFile` vs `choice.expand`) y mostrar el
  error en vez de `selectFile(null)` en silencio; `enabled` solo con revisión local.
- `HistoryView.tsx`: error de página posterior como banner con reintento, no reemplaza la tabla.
- `ErrorBoundary` en `App.tsx`/`main.tsx` con mensaje en español.
- `liveRepository.ts`: mensaje `Degraded` por `userMessage`; contador de generación a nivel
  de módulo; registrar `listen` antes de `watch`; `errors.ts` con type guard
  `isAppErrorKind` y texto fijo para errores desconocidos.
- `index.html` `lang="es"`. Teclado en `CommitTable` (Tab alcanzable, mover foco,
  Home/End/PageUp/PageDown, menú desde teclado) y checkout desde el sidebar.

## Fase 2 — Reglas con guardia automática

- Test en `src-tauri` que verifique que todo `#[tauri::command]` usa `read(`/`write(`
  (excepciones explícitas) y que ningún `State` contiene `Repository` (B5).
- Test de despacho IPC de todos los comandos; corregir comentario obsoleto (B7).
- Clippy workspace: `todo`, `unimplemented`, `dbg_macro`, `print_stdout/stderr`,
  `string_slice`, `arithmetic_side_effects`, `missing_docs`; `disallowed-methods` para
  `std::process::Command` y `thread::sleep` (salvo `retry`).
- ESLint: prohibir también `import()`/`require` en `graph-layout`; regla TSDoc
  (`eslint-plugin-jsdoc`) para exports públicos.
- Typecheck de `e2e/`, `wdio.conf.ts` y configs (`typecheck:e2e`, `typecheck:node`,
  o `tsc -b`) en `dev-check.yml` y `quality.yml`; añadir `noUncheckedIndexedAccess` y
  `exactOptionalPropertyTypes` a `tsconfig.e2e.json`/`tsconfig.node.json`;
  `no-floating-promises` también en e2e. Quitar `--passWithNoTests`.
- Pre-commit: eslint/prettier solo sobre staged, mostrar salida al fallar; corregir
  la cifra "2 s" en docs. Crear el hook `commit-msg` (una línea, inglés, tipos válidos,
  sin trailers ni menciones a IA) o dejar de listarlo en `install-git-hooks.sh`.
- CI: `cargo deny`/`cargo audit`, `dependabot.yml`; `release.yml` valida que el tag
  esté en `main` y que `package.json`, `Cargo.toml` y `tauri.conf.json` coincidan;
  `rust-toolchain.toml` fijo a `rust-version`; `$RUNNER_TEMP`; evitar la doble compilación
  e2e; `bundle.targets` explícito y `minimumSystemVersion`.
- Capabilities: sustituir `core:default` por `core:event:default` + `dialog:allow-open`
  (verificar que la app arranca y los e2e pasan).

## Fase 3 — Estado, rendimiento y UX (media)

- `useGitActions`: invalidar con el alcance de `LIVE_QUERIES`, no `invalidateQueries()`
  global; limpiar `notice` por repo y poder cerrarlo; singular/plural.
- Módulo único `queryKeys` + `invalidateLive()` (hoy repartido en 3 archivos).
- Historial: `maxPages` o refresco solo de la primera página; `Map`/`useMemo` en lugar de
  `commits.find` por render; `fetchNextPage` estable.
- `AppShell`: ignorar `getStartupRepository` tardío; selección huérfana de `revealCommit`.
- `Resizer` (limpiar `userSelect`, doble clic = valor por defecto, filtrar `button`),
  `ContextMenu` (ref para `onClose`, flechas, devolver foco), Escape de `FileDiffView`.
- `GraphCanvas`: un solo `filter` por `<g>`, alto acotado/virtual; paleta por tema en
  `graph-layout/colors.ts` con test de contraste en ambos temas.
- Cachear `Intl.DateTimeFormat`, usar locale `es` con año; `useDeferredValue` en la búsqueda.
- Core: `diff.stats()` sin construir `Patch`; fingerprint barato; política única de
  tamaños de página (rechazar, no recortar); `watch.rs` debounce con tope máximo.
- Textos en inglés restantes de la UI → español; unificar `messageFor` con `KIND_SUMMARY`.

## Fase 4 — Duplicación y código muerto

- Frontend: tipo `ChangedFile` único; `compareNames`/collator compartido;
  `<DiffStat>`, `<RetryError>`, `<FolderIcon>`; helper `safeStorage`; mover geometría
  compartida fuera de `CommitTable`; borrar `src/components/InspectorEmpty/` vacío,
  `selectedFileSource` duplicado, exports sin consumidores y `validateRepository`/
  `getCloneCacheStatus` si siguen sin uso; imports duplicados en `FileDiffView.tsx`.
- CSS: tokens de espaciado/radio/tipografía/`--focus-ring`; primitivos `.button` y
  `.state` compartidos; dividir `CommitDetailPanel.css`; anchos 220/310 desde una sola fuente.
- Core: `FileDiff`/`FileDiffSummary` y `FileContent`/`WorktreeFileContent` con base común;
  fold de estadísticas único; `ContentRead::TooLarge` único; doc de `actions.rs` unificada;
  reducir superficie `pub` (`pub(crate)`); `get_commit_diff`/`get_commits` solo-tests a
  `#[cfg(test)]` o mantener y documentar; quitar `clone_url` decorativo; dev-deps redundantes
  (`serde_json`); evitar la doble conexión del push.
- Rustdoc faltante en campos y tipos públicos; TSDoc en `session.ts`, `tree.ts`, etc.

## Fase 5 — Tests

- `test-utils` compartido en frontend (QueryClient, mock IPC, wrapper); sustituir
  `querySelector`/clases por roles; fortalecer aserciones débiles.
- Cubrir: `Degraded` y timer de 30 s, huella cambiada, copia al portapapeles, `Resizer`,
  reveal de `HistoryView`, `parseHunks`, expansión del working tree, symlinks, `MAX_PAGES`.
- Rust: `matches!` en lugar de `format!("{e:?}").contains`, eliminar `.is_err()` sueltos,
  arreglar tests que no prueban lo que dicen (`watch.rs`, `worktree.rs`, `github_api.rs`),
  sustituir `sleep(2s)` por espera con condición, mover `history_verification` a
  `benches/` o `examples/`.
- e2e: helper `waitForHistory()`, eliminar `browser.pause`, rutas con `os.tmpdir()`,
  fusionar o retirar de CI `screenshots`/`collapse`/`audit` (sin aserciones), desacoplar
  `local-changes`; reducir `specFileRetries`.
- Demo (`scripts/*.mjs`, `e2e/recording/`): mover a `tools/` fuera del typecheck y del CI,
  una sola variable de entorno, errores en inglés, prerequisitos (`bitacora-engine`,
  ffmpeg, magick) documentados.

## Fase 6 — Documentación

- `CONTEXT.md` y ADR 0001: el watcher vigila metadata; el árbol, por fingerprint. Acotar
  "read-only" (la app hace checkout/pull/push).
- `README.md`: ruta real de logs, estado del release, comandos de verificación
  reales, requisitos de demo. `CHANGELOG.md`: fusionar los dos `### Added`, enlaces de
  comparación. `DESIGN.md` (fuentes reales), `PRODUCT.md` (plataforma),
  `docs/ASSET.md`/`SNAPSHOT.md` sincronizados. CLAUDE.md: índice con `CONTEXT/PRODUCT/DESIGN/adr`,
  regla 10 y regla 7 con la redacción real. `TASKS.md`: registrar fase H2 y los
  commits ya hechos (`c954492`, `7f24bb6`).

## Orden y esfuerzo

Fase 0 → 1 → 2 → 3 → 4 → 5 → 6. Cada fase en commits pequeños por subsistema
(`fix(diff): …`, `fix(worktree): …`, `ci: …`, `refactor(ui): …`). El release a `main` sigue
siendo exclusivo del skill `/release` y espera aprobación de David.

## Verificación

- Local: `./pre-commit`, `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`,
  `cargo test`, `npm run typecheck` (+ e2e/node), `npx eslint .`, `npx prettier --check .`,
  `npx vitest run --coverage` (umbral 90% en `graph-layout`).
- `cargo test` regenera `src/bindings.ts` al cambiar `AppError`/tipos: confirmar que el
  diff es solo el esperado y que nunca se edita a mano.
- Pruebas manuales/e2e: abrir un repo grande con un commit enorme (A1), un symlink interno
  en el worktree (A2), cambiar de repo con el watcher activo (M2), cortar la red durante
  clone/lista de repos (timeouts), tema claro del graph, navegación solo con teclado.
- E2E en ubuntu vía `scripts/run-e2e.sh`.