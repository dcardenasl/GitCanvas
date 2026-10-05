# TASKS — GitCanvas

> Fuente de verdad de ejecución. El plan rector está en
> [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones de trabajo y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).
> Historial de tareas completadas: [`ARCHIVES.md`](ARCHIVES.md).

**Estado:** H2 pendiente (10/46) · Release v0.1.0 pendiente (R-4 a R-6, requieren aprobación de David) · actualizado 2026-10-04

## Cómo se usa este archivo

- **Una tarea = un commit.** El ID de la tarea es estable para siempre: no se renumera
  nunca, y si se cancela se deja `~~tachada~~` con el motivo.
- **Cada tarea se marca `[x]` en el mismo commit que la implementa.** Nunca por lotes al
  final: el valor del archivo es que su estado sea cierto en cualquier punto del
  historial, para que una sesión nueva haga `git pull` y sepa exactamente dónde está.
- Cuando aparece algo que el plan no previó, se anota bajo la tarea con
  `*Hallazgo durante la ejecución:*`. Eso evita que la próxima sesión repita el error.
- La flecha `→` de cada tarea es el mensaje de commit exacto que le corresponde.

---

## 🧭 Fase H2 — Endurecimiento post-auditoría (pendiente)

Plan de trabajo derivado de la auditoría estática completa del 2026-10-04:
[`docs/plan/2026-10-04-plan-de-endurecimiento.md`](docs/plan/2026-10-04-plan-de-endurecimiento.md).
Ese documento contiene los hallazgos, ubicaciones, criterios técnicos, orden de fases y
verificación manual completos; leerlo antes de ejecutar cada tarea. La auditoría inicial
indica que se respetan las decisiones rectoras, pero sus hallazgos deben verificarse en
el código antes de modificarlos. Si no se reproducen, descartar el hallazgo y dejar la
evidencia aquí.

**Convenciones:** trabajar en `dev`; una unidad verificable y un commit por tarea; mensaje
de commit de una línea en inglés, sin trailers ni menciones a IA; nombrar explícitamente
los archivos tocados; actualizar esta tarea en el mismo commit que la implementación.
Actualizar `CHANGELOG.md` solo para `feat`, `fix` o `perf`. Ejecutar las comprobaciones
pertinentes del plan y registrar resultados/hallazgos. No iniciar publicación a `main`:
la sigue controlando exclusivamente `/release` y requiere aprobación de David.
Los commits `c954492` (branding) y `7f24bb6` (grabador de demo) ya están presentes en
`dev`; la auditoría los tuvo en cuenta y no son tareas pendientes.

### H2-0 — Desbloqueo del hook

- [x] **H2-0 — Excluir el artefacto de brag del análisis.** Añadir `brag-output/` a
      `.gitignore`, `.prettierignore` y a `ignores` de `eslint.config.js` (o mover el
      artefacto fuera del repositorio si la configuración vigente lo aconseja). Confirmar
      que el hook `./pre-commit` pasa con el directorio generado presente.
      → `chore: ignore generated brag output`

### H2-1 — Correctitud y seguridad

- [x] **H2-1 — Acotar los diffs de commits.** `get_commit_diff` devuelve metadatos para
      todos los archivos y solo materializa el parche del archivo seleccionado. Los diffs
      con más de 5.000 rutas fallan de forma tipada antes de detectar renombres; las
      expansiones respetan el límite duro de 16 MiB y se marcan `TooLarge` si lo exceden.
      `FileDiffView` ya envía el archivo solicitado y los snapshots no piden un parche.
      *Verificado:* `cargo test -p gitcanvas-core --test diff`, `cargo test -p gitcanvas-core
      --lib`, binding exportado, `npm run typecheck`, tests Vitest de `diff`, `FileDiffView`
      e IPC con Node 22 (48 tests), `./pre-commit`.
      → `fix(diff): bound commit diff reads`
- [x] **H2-2 — Asegurar lecturas del worktree.** Se rechazan symlinks internos y externos,
      cualquier segmento `.git`, rutas fuera del root canónico y cambios de identidad entre
      la apertura y la lectura; el resolver usa `ActiveRepo::path()`.
      *Verificado:* `cargo test -p gitcanvas-core --test worktree` (8 tests) y
      `cargo test -p gitcanvas-core --lib` (21 tests).
      → `fix(worktree): validate paths and reject symlinks`
- [x] **H2-3 — Clasificar rutas del watcher correctamente.** La clasificación inspecciona
      solo componentes relativos al directorio de metadata, no nombres de carpetas padre.
      *Verificado:* test de `config`, `refs/heads/main` e `index.lock` bajo una ruta cuyo
      ancestro se llama `refs`; `cargo test -p gitcanvas-core --lib` (22 tests) y
      `cargo clippy -p gitcanvas-core --all-targets -- -D warnings`.
      → `fix(watch): classify paths relative to metadata`
- [x] **H2-4 — Endurecer cliente REST de GitHub.** `ureq::Agent` fija timeout global de
      30 s y conexión de 10 s; 401, falta de scopes, 403 por rate limit y 429 tienen
      diagnósticos distintos. El límite de 1.000 repositorios devuelve `truncated` y se
      explica en el selector. `with_base_url` está oculto en docs y valida HTTPS salvo IP
      loopback/localhost.
      *Verificado:* 9 tests de `github_api`, 24 tests core, contrato TypeScript regenerado,
      typecheck y 40 tests de GitHubPicker/IPC; pruebas de timeout config, status, truncado
      y rechazo de URLs HTTP externas.
      → `fix(github): bound requests and classify api limits`
- [x] **H2-5 — Hacer segura la concurrencia de clone y cache.** Locks advisory entre
      procesos por entrada, staging único con limpieza RAII y recuperación de parciales
      huérfanos bajo el lock; retención vuelve a leer el estado bajo lock, conserva tanto
      el clon nuevo como el repo activo y acumula fallos de borrado sin borrar esa entrada.
      *Verificado:* `cargo test -p gitcanvas-core --lib` (24 tests, incluido clone concurrente
      y lectura concurrente de caché), `cargo test -p gitcanvas-core --test cache` (12 tests),
      `cargo clippy -p gitcanvas-core --all-targets -- -D warnings`, binding regenerado,
      `npm run typecheck`, 40 tests Vitest de GitHubPicker/IPC y `./pre-commit`.
      → `fix(github): serialize clone cache mutations`
- [x] **H2-6 — Rechazar blobs demasiado grandes antes de leerlos.** `blob.size()` se
      comprueba antes de llamar a `content()` tanto para contenido de commit como de index;
      la política compartida conserva la omisión `TooLarge` inicial y el error tipado al
      exceder el tope de expansión, con ruta y límite en el mensaje.
      *Verificado:* `cargo test -p gitcanvas-core --test blob` (6 tests),
      `cargo test -p gitcanvas-core --test worktree` (9 tests, incluye staged por encima
      del límite de expansión), `cargo clippy -p gitcanvas-core --all-targets -- -D warnings`
      y `./pre-commit`.
      → `fix(core): check blob sizes before reading content`
- [x] **H2-7 — Centralizar errores del dominio.** `AppError` incorpora `Auth`, `Network`
      y `Conflict`; las conversiones centralizan errores `git2` y `keyring`, con helper
      `from_git2_remote` en operaciones remotas. Acciones, clone, credenciales y REST
      propagan categorías operativas; `KIND_SUMMARY` muestra cada una en español.
      *Verificado:* 26 tests core, 10 `github_api`, 17 `actions`; binding regenerado y diff
      limitado a las tres variantes; `npm run typecheck`, 46 tests Vitest focalizados,
      `cargo clippy -p gitcanvas-core --all-targets -- -D warnings` y `./pre-commit`.
      → `refactor(errors): centralize domain error mapping`
- [x] **H2-8 — Corregir acciones y límites latentes del core.** Pull actualiza la rama con
      `reference_matching` contra el OID que leyó; `history::insert` omite snapshots que
      no caben (preservando la entrada válida previa), y el shift del backoff satura con
      `checked_shl` antes de multiplicar la duración.
      *Verificado:* `cargo test -p gitcanvas-core --lib` (28 tests, incluye presupuesto 0,
      reemplazo sobredimensionado y 40 reintentos), `cargo test -p gitcanvas-core --test
      actions` (17 tests, fast-forward incluido), Clippy core y `./pre-commit`.
      → `fix(core): guard history insertion and retry shifts`
- [x] **H2-9 — Corregir ciclo de vida del watcher.** El reemplazo y eliminación de watchers
      se destruyen dentro de `runtime::write`; las generaciones se avanzan monotónicamente,
      `unwatch` invalida la generación pendiente y los starts viejos no reemplazan repos más
      nuevos.
      *Verificado:* `cargo test -p gitcanvas --lib commands::watch::tests` (3 pruebas de
      cambio/unwatch concurrentes), `cargo clippy -p gitcanvas --all-targets -- -D warnings`
      y `./pre-commit`.
      → `fix(watch): invalidate stale watcher generations`
- [ ] **H2-10 — Aplicar gates de lectura y timeout a runtime.** `list_github_repositories`
      debe usar gate de lectura; aplicar timeout al permiso/runtime y cubrir contención.
      → `fix(runtime): gate repository listing and bound permission waits`
- [ ] **H2-11 — Restringir operaciones a repositorios permitidos.** Poblar `AllowedRepos`
      desde `open_repository`, `get_startup_repository` y clone; implementar `with_repo`
      para consolidar apertura/validación de los 14 comandos. Si no se adopta la allowlist,
      documentar en el resultado por qué y reformular la regla 7 de `CLAUDE.md`.
      → `refactor(commands): centralize allowed repository access`
- [ ] **H2-12 — Normalizar token GitHub en backend y frontend.** Aplicar `trim()` en ambos
      extremos y hacer que `has_github_token` devuelva `Result<bool>`; actualizar IPC,
      frontend, bindings y pruebas.
      → `fix(github): trim tokens and propagate keyring errors`
- [ ] **H2-13 — Alinear reglas de secretos y repositorios.** Reformular regla 10 para
      expresar el flujo real del token (nunca sale del backend; solo entra una vez) y
      regla 7 según la solución adoptada en H2-11. Mantener consistencia con arquitectura
      y ADRs.
      → `docs: clarify repository and token boundary rules`
- [ ] **H2-14 — Corregir parsing de hunks.** En `DiffViewer/parse.ts`, ignorar cabeceras
      solo antes del primer `@@`; test con contenido `-- x` posterior al inicio del hunk.
      → `fix(diff): preserve hunk lines beginning with dashes`
- [ ] **H2-15 — Corregir estados y errores de vistas de diff e historial.** Unificar
      expansión de archivos, mostrar errores de selección explícitamente, habilitar acciones
      solo con revisión local; los errores de páginas siguientes deben ser banner con
      reintento y preservar filas ya cargadas.
      → `fix(ui): preserve diff and history data on page errors`
- [ ] **H2-16 — Añadir frontera de error global localizada.** Incorporar `ErrorBoundary`
      en `App.tsx`/`main.tsx` con mensaje español y prueba del fallback.
      → `feat(ui): add a localized application error boundary`
- [ ] **H2-17 — Hacer fiable la inicialización del repositorio en vivo.** Usar
      `userMessage` al mostrar estado `Degraded`; mover generación a nivel módulo; registrar
      `listen` antes de `watch`; agregar `isAppErrorKind` y texto seguro para errores
      desconocidos en `errors.ts`.
      → `fix(live): make watcher startup and errors reliable`
- [ ] **H2-18 — Completar idioma y acceso por teclado.** `index.html` en español; tabla de
      commits alcanzable con Tab, foco, Home/End/PageUp/PageDown y menú por teclado; permitir
      checkout desde sidebar. Cubrir navegación sin mouse.
      → `feat(ui): complete keyboard navigation and localization`

### Reglas con guardia automática

- [ ] **H2-19 — Proteger invariantes de comandos y estado.** Tests `src-tauri` para que
      cada `#[tauri::command]` use `read(`/`write(` salvo excepciones explícitas y ningún
      `State` contenga `Repository` (B5). Agregar test de despacho IPC para todos los
      comandos y corregir comentario obsoleto (B7).
      → `test(tauri): enforce command and ipc invariants`
- [ ] **H2-20 — Ampliar guardias Clippy.** Configurar prohibiciones del plan para
      `todo`, `unimplemented`, `dbg_macro`, `print_stdout/stderr`, `string_slice`, efectos
      aritméticos y docs faltantes; métodos prohibidos `std::process::Command` y
      `thread::sleep`, con excepción focalizada para `retry`. Resolver diagnósticos sin
      silencios amplios.
      → `chore(rust): enforce additional workspace lint rules`
- [ ] **H2-21 — Cerrar fronteras ESLint y TSDoc.** Prohibir `import()` y `require` hacia
      `graph-layout`; añadir regla TSDoc para exports públicos y documentar excepciones
      justificadas.
      → `chore(ts): enforce graph imports and public api docs`
- [ ] **H2-22 — Tipar y validar todos los proyectos TypeScript.** Incorporar e2e, WDIO y
      configs a `typecheck:e2e`/`typecheck:node` o `tsc -b` en workflows; endurecer configs
      con `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y `no-floating-promises`
      para e2e; quitar `--passWithNoTests`.
      → `ci: typecheck e2e and node projects`
- [ ] **H2-23 — Hacer útil el hook de pre-commit y validar mensajes.** Ejecutar eslint y
      prettier solo sobre staged, mostrar diagnóstico original si falla; corregir cifra de
      duración en docs. Añadir hook `commit-msg` con formato exigido o eliminar su mención
      del instalador si se decide no implementarlo.
      → `chore(hooks): validate staged files and commit messages`
- [ ] **H2-24 — Endurecer workflows y releases.** Incorporar `cargo deny`/`cargo audit` y
      Dependabot; validar que el tag de release procede de `main` y que versiones de
      `package.json`, `Cargo.toml`, `tauri.conf.json` coinciden; fijar toolchain a
      `rust-version`; usar `$RUNNER_TEMP`; evitar doble build E2E; declarar targets y
      `minimumSystemVersion` explícitos.
      → `ci: validate dependencies and release metadata`
- [ ] **H2-25 — Reducir permisos Tauri a los usados.** Reemplazar `core:default` por
      `core:event:default` y `dialog:allow-open`; confirmar arranque y E2E multiplataforma.
      → `chore(tauri): narrow application capabilities`

### Estado, rendimiento y UX

- [ ] **H2-26 — Acotar invalidación de queries y avisos.** Invalidar por alcance
      `LIVE_QUERIES`, permitir cerrar notice, limpiarlo al cambiar repo y corregir singular
      y plural.
      → `fix(ui): scope live query invalidation`
- [ ] **H2-27 — Centralizar query keys y refresh en vivo.** Módulo único `queryKeys` y
      `invalidateLive()`; retirar duplicación en tres archivos, con pruebas de alcance.
      → `refactor(ui): centralize query keys and live invalidation`
- [ ] **H2-28 — Reducir trabajo de paginación de historial.** Aplicar `maxPages` o refrescar
      solo primera página según comportamiento; indexar commits con `Map`/`useMemo` y
      estabilizar `fetchNextPage`.
      → `perf(history): bound pages and index commits`
- [ ] **H2-29 — Evitar selecciones obsoletas de AppShell.** Ignorar respuesta tardía de
      startup repository y resolver selección huérfana de `revealCommit`.
      → `fix(ui): ignore stale repository and reveal selections`
- [ ] **H2-30 — Corregir teclado y ergonomía de controles.** Resizer: limpiar `userSelect`,
      doble clic vuelve al valor inicial y filtrar botones; ContextMenu: callback actualizado,
      flechas y retorno del foco; Escape cierra `FileDiffView`.
      → `fix(ui): restore focus and keyboard control behavior`
- [ ] **H2-31 — Acotar y tematizar GraphCanvas.** Un solo `filter` por `<g>`, altura limitada
      o virtualización; paleta de `graph-layout/colors.ts` por tema y test de contraste para
      ambos temas.
      → `perf(graph): bound canvas rendering and theme colors`
- [ ] **H2-32 — Mejorar búsqueda y fechas.** Cachear `Intl.DateTimeFormat`, locale `es` con
      año y `useDeferredValue` en búsqueda.
      → `perf(ui): defer search and reuse date formatters`
- [ ] **H2-33 — Unificar límites de core y debounce.** Usar `diff.stats()` sin construir
      `Patch`, fingerprint barato, política común que rechaza páginas fuera de rango y
      debounce del watcher con tope máximo; tests de límites.
      → `perf(core): bound fingerprints and watcher debounce`
- [ ] **H2-34 — Completar idioma del frontend.** Traducir textos restantes al español y
      consolidar `messageFor` con `KIND_SUMMARY`.
      → `fix(i18n): align remaining frontend messages`

### Duplicación y código muerto

- [ ] **H2-35 — Consolidar modelos y helpers de frontend.** Tipo `ChangedFile`, comparador
      de nombres, `DiffStat`, `RetryError`, `FolderIcon`, `safeStorage`, geometría compartida;
      retirar `InspectorEmpty` vacío, `selectedFileSource` duplicado, exports sin usos y
      validadores/estado de caché de clone solo si se confirma que no tienen consumidores.
      Eliminar imports duplicados de `FileDiffView.tsx`.
      → `refactor(ui): consolidate file and display helpers`
- [ ] **H2-36 — Compartir tokens y primitivos de estilo.** Tokens de espaciado, radio,
      tipografía y foco; `.button`/`.state` comunes; dividir `CommitDetailPanel.css` y
      centralizar anchos 220/310.
      → `refactor(styles): centralize design tokens and primitives`
- [ ] **H2-37 — Reducir duplicación y superficie pública de core.** Bases comunes para
      `FileDiff`/`FileDiffSummary` y contenidos; fold único de stats y `ContentRead::TooLarge`;
      unificar docs de acciones; `pub(crate)` donde baste; cfg/test-doc para métodos solo
      test; retirar `clone_url` decorativo, dev-dep redundante y conexión duplicada de push.
      → `refactor(core): consolidate diff types and internal APIs`
- [ ] **H2-38 — Completar documentación de API.** Rustdoc de campos/tipos públicos y TSDoc
      en `session.ts`, `tree.ts` y APIs públicas identificadas.
      → `docs(api): document public rust and typescript interfaces`

### Calidad de pruebas

- [ ] **H2-39 — Compartir utilidades de tests frontend.** Crear `test-utils` para
      QueryClient, mock IPC y wrapper; reemplazar selectores/clases por roles y fortalecer
      aserciones débiles.
      → `test(ui): share accessible component test utilities`
- [ ] **H2-40 — Cubrir flujos frontend y límites omitidos.** Tests de `Degraded` y timer 30s,
      fingerprint modificado, portapapeles, Resizer, reveal de HistoryView, `parseHunks`,
      expansión del working tree y `MAX_PAGES`.
      → `test(ui): cover live repository and navigation edge cases`
- [ ] **H2-41 — Corregir pruebas Rust que dan señal falsa.** Preferir `matches!` a comparar
      debug strings; eliminar `.is_err()` sin aserción; corregir tests señalados de watcher,
      worktree y GitHub API; sustituir sleeps fijos por espera con condición; mover
      `history_verification` a benches/examples.
      → `test(core): assert typed outcomes and remove timing races`
- [ ] **H2-42 — Hacer E2E determinista y relevante.** Helper `waitForHistory()`, quitar
      `browser.pause`, usar `os.tmpdir()`, retirar/fusionar specs sin aserciones, desacoplar
      `local-changes` y reducir reintentos conforme a evidencia.
      → `test(e2e): replace fixed waits with observable conditions`
- [ ] **H2-43 — Sacar herramientas de demo del CI/typecheck.** Mover scripts y recorder a
      `tools/`, consolidar variable de entorno, mensajes en inglés, documentar
      `bitacora-engine`, ffmpeg y magick.
      → `chore(demo): isolate recorder tooling and document prerequisites`

### Documentación y cierre

- [ ] **H2-44 — Sincronizar documentos de arquitectura y producto.** Actualizar `CONTEXT.md`
      y ADR 0001 para explicar watcher de metadata versus fingerprint de árbol y acotar
      “read-only” dado que existen checkout/pull/push; sincronizar README, CHANGELOG,
      DESIGN, PRODUCT, `docs/ASSET.md`, `docs/SNAPSHOT.md` y el índice/reglas de `CLAUDE.md`.
      → `docs: align architecture and product documentation`
- [ ] **H2-45 — Cerrar trazabilidad de H2.** Revisar conteo/estado de tareas, documentar
      divergencias verificadas frente al plan, commits ya registrados y evidencia final.
      Ejecutar la verificación local definida por el plan y las comprobaciones manuales
      aplicables; registrar fallos ambientales sin declararlos verdes.
      → `docs(tasks): close post-audit hardening`

**Criterio de cierre:** H2-0 a H2-45 completadas o hallazgos explícitamente descartados
con evidencia; verificación local y pruebas manuales del plan registradas; docs y TASKS
sin divergencias. La publicación sigue el proceso `/release` por separado.

---

## 🔴 Pendiente — Release v0.1.0

> Ejecutado con el skill `/release`. Ver `CLAUDE.md` para el procedimiento completo.
> R-1 a R-3 están completadas y archivadas en [`ARCHIVES.md`](ARCHIVES.md).

- [ ] **R-4 — PR `dev → main`.** Abrir, esperar `quality` verde, **esperar aprobación de
      David**, y mergear con `--merge` (nunca squash ni rebase).

- [ ] **R-5 — Tag y GitHub Release.** `v0.1.0` solo sobre `main`; `release.yml` crea el
      Release extrayendo la sección del CHANGELOG. Nunca `gh release create` a mano.

- [ ] **R-6 — Actualizar la ficha del asset.** `docs/ASSET.md` y `docs/SNAPSHOT.md`:
      versión, repositorio, estado del build por componente y log de avances.
      → `docs(asset): record the v0.1.0 release in the asset sheet`
