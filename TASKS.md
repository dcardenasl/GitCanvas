# TASKS — GitCanvas

> Fuente de verdad para el trabajo pendiente. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Tareas completadas, con su evidencia: [`ARCHIVES.md`](ARCHIVES.md).
> Planes: [endurecimiento H2](docs/plan/2026-10-04-plan-de-endurecimiento.md),
> [tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md) y el
> [plan general](docs/plans/2026-09-08-plan-de-implementacion.md).

**Estado al 2026-11-09:** v0.7 está implementada localmente en `dev`; la evidencia de su
verificación y sus límites está en [`docs/verification/v0.7.md`](docs/verification/v0.7.md).
La verificación histórica de v0.6 está en [`docs/verification/v0.6.md`](docs/verification/v0.6.md). Los
manifiestos están en 0.6.0, existe el tag local `v0.6.0` y `main` local contiene el
merge del PR #16. Esta revisión no verificó la publicación remota ni repitió release.
`dev` incluye las entregas posteriores a v0.6 y la implementación completa de stash.
La funcionalidad está verificada en macOS; Linux/Windows nativos y lector de pantalla real
permanecen como gates externos sin evidencia. No es una release.
Crear commits permanece al final de la secuencia, objetivo v0.12. El
[roadmap vigente](docs/plan/2026-10-19-roadmap-de-versiones.md) prevalece sobre
asignaciones de versiones de planes anteriores.

Los gates históricos sin evidencia siguen abiertos: GRF-5, V05-VERIFY, WS-17 y los
límites declarados en las verificaciones de v0.4–v0.6. La verificación de v0.7 no
los cierra ni les atribuye pruebas nuevas.

**Estado de trabajo:** rama `dev`; cierre de v0.7 completado localmente. No se hizo push
ni se consultó el servidor. No afirmar sincronización remota ni publicación.
Se preservan `docs/audits/evidence/`, `docs/media/`, `install-backups/` y
`tools/demo/record-v05*`, sin seguimiento; no agregarlos a commits. No cambiar versiones,
crear tags ni publicar como parte de la planificación.

## Siguiente paso

v0.7 queda cerrada en `dev`. La siguiente entrega se define según el roadmap vigente.
Los gates históricos y la verificación de v0.7 en Linux/Windows/lector real siguen como
seguimiento independiente.

## Cola de trabajo

### v0.7 — Stash de solo lectura (completada en dev)

Plan: [decisiones ST-D01–ST-D10, contrato, matriz y dependencias](docs/plan/2026-11-08-v0.7-implementacion.md).
Arquitectura: [ADR 0009](docs/adr/0009-read-only-stash.md), aceptada para ST-1 y
implementada de ST-0 a ST-8. Evidencia completa y límites:
[verificación v0.7](docs/verification/v0.7.md).

- [x] **ST-0 — Plan y contrato.** Entrevista, decisiones, diseño técnico, límites,
      matriz y tareas documentados. Prueba exploratoria en repositorio Git temporal;
      no es evidencia de una funcionalidad implementada. Sin cambios en código,
      manifiestos, release ni commits.
- [x] **ST-1 — Listado estable, búsqueda y paginación.** Lectura acotada del reflog
      común, revisión/cursor, metadatos fieles, búsqueda completa y presencia por OID.
      Pruebas diferenciales, carreras, límites y medición. Depende de ST-0.
      Implementación en `gitcanvas-core::stash`, sin escrituras ni subprocesos de
      producción. Treinta y tres pruebas nuevas más benchmark explícito; suites
      del workspace con todas las features: 297 aprobadas, dos benchmarks omitidos
      por defecto. El benchmark de stash se ejecutó aparte en release: 22,39 ms para
      20.000 entradas/2.999.902 bytes. Clippy estricto y formato aprobados; bindings
      existentes sin deriva. UI/E2E completados después en ST-3–ST-8; ver
      [evidencia](docs/verification/v0.7.md).
- [x] **ST-2 — Comparaciones y contenido inmutable.** Todos, preparados, sin preparar
      y no rastreados; contenido anterior/guardado, origen exacto, lectores compartidos
      y límites. Depende de ST-1.
      Implementada en `4eeec7b`, con lectores compartidos extraídos en `c1ef95c`.
      Veinticuatro pruebas nuevas; motor completo: 264 aprobadas, tres benchmarks
      omitidos por defecto. Benchmark explícito de 5.000 archivos: primera página
      154,18 ms y un parche 135,37 ms. Límites de memoria y resultados en la
      [verificación v0.7](docs/verification/v0.7.md).
- [x] **ST-3 — IPC y observación del stash compartido.** Comandos autorizados,
      bindings, alcance stash, reflog/ref, fingerprint y eventos combinados sin
      invalidar el grafo por cambios exclusivos de stash. Depende de ST-1/ST-2.
- [x] **ST-4 — Estado por pestaña y consultas.** Navegación de sesión, selección
      estable, búsqueda acotada, refresco/activación, eliminación externa, LRU y
      plegado durable sin persistir inspección. Depende de ST-3.
- [x] **ST-5 — Sección e inspector de stash.** Listado, búsqueda, comparaciones,
      archivos y estados claros; EN/ES; sin acciones de escritura. Depende de ST-4.
- [x] **ST-6 — Visor y navegación integrados.** Diff, ambos lados, cambios de modo,
      fijado/ocultamiento, volver/Escape y conservación del gráfico. Depende de ST-5.
- [x] **ST-7 — Accesibilidad y verificación integrada.** Fixture E2E, cambios externos,
      worktrees, cero escrituras por inspección, temas/idiomas/940×600 y evidencia
      de teclado/lector por plataforma. Depende de ST-6.
- [x] **ST-8 — Verificación final y documentación entregada.** Suites, auditorías,
      build y evidencia real; actualizar producto/arquitectura y CHANGELOG según
      comportamiento implementado. Sin autorización implícita de release. Depende
      de ST-1–ST-7.

### Entregas anteriores y seguimiento

Las secciones siguientes conservan evidencia y tareas históricas. Los gates externos
sin evidencia permanecen abiertos y separados del cierre de v0.7.

### v0.4 — Líneas y colores de las ramas

Estrategia aprobada el 2026-10-19. Alcance, orden y aceptación en el
[roadmap de versiones](docs/plan/2026-10-19-roadmap-de-versiones.md).

- [x] **GRF-0 — Reconciliar evidencia histórica de WS-17.** Separar CI y publicación
      ya realizadas de comprobaciones manuales sin evidencia. No repetir la release.
- [x] **GRF-1 — Contrato y casos de referencia.** Separar geometría, identidad de
      referencia y color; definir diseño técnico y fixtures del gráfico.
- [x] **GRF-2 — Identidad cromática y persistencia.** Paleta, principal visual,
      relación local/upstream y migración de preferencias por repositorio.
- [x] **GRF-3 — Líneas del gráfico.** Mejorar continuidad, curvas, separación y cruces
      conservando topología, nodos únicos y layout reanudable.
- [x] **GRF-4 — Integración y controles.** Colores coherentes panel/gráfico y controles
      accesibles de color/principal visual; historia compartida y recuperación.
- [ ] **GRF-5 — Verificación.** Paginación, temas, idiomas, reinicio, pestañas,
      upstream, tamaño mínimo y recorridos nativos en los tres sistemas.
- [x] **GRF-6 — Documentación y preparación de release.** Evidencia y CHANGELOG;
      publicación según flujo del proyecto cuando se autorice.

Evidencia de implementación: snapshot compartido y upstreams; esquema 1→2 y
preferencias independientes del cierre; modelo puro con primer padre, carril principal
reservado y trayectorias que confluyen en el nodo. Pruebas de equivalencia paginada,
principal tardía, octopus y DAGs generados; verificación integrada aún en GRF-5.

Verificación local cerrada: 807 pruebas frontend (95,50% statements, 96,87% líneas;
umbrales globales y por módulo aprobados), 220 Rust con todas las features, Clippy
estricto y bindings sin deriva. Siete specs/dieciséis pruebas E2E nativas en macOS,
incluyendo ambos temas/idiomas a 940×600 y fixture de 10.000 commits/doce trayectorias.
Tipos, lint, formato, auditorías y build de producción macOS aprobados; firma local
verificada. GRF-5 permanece abierta por Linux/Windows, lector de pantalla real y
recorridos manuales sin evidencia. Detalles y límites en la verificación de v0.4.

### v0.5 — Panel, filtros y worktrees

Plan detallado: [implementación v0.5](docs/plan/2026-10-26-v0.5-implementacion.md).
El [roadmap](docs/plan/2026-10-19-roadmap-de-versiones.md) y la
[especificación del panel D01–D50](docs/plan/2026-10-18-panel-izquierdo-ui-ux.md)
definen el alcance funcional. Leer también [ADR 0006](docs/adr/0006-workspace.md),
[ADR 0007](docs/adr/0007-stable-branch-graph.md), `CONTEXT.md`, `ARCHITECTURE.md` y
`CLAUDE.md` antes de cada tarea. Las referencias concretas y criterios por tarea están
en la sección enlazada del plan. Sin creación/retirada de worktrees, commits, resolución
de conflictos Git, autores ni releases; el checkout explícito existente se conserva.

- [x] **WT-1 — Identidad, inventario y actualización.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#wt-1--identidad-inventario-y-actualizacion), [ADR 0006](docs/adr/0006-workspace.md), [`CONTEXT.md`](CONTEXT.md). Inventario por directorio Git común; estados detached/ausente/bloqueado; watcher, activación y actualización explícita, sin sondeo inactivo. Descubrir una ruta no autoriza Git. Evidencia: pruebas de worktrees enlazados, clones independientes, ubicación ausente/bloqueada, eventos externos y validación al abrir; `cargo test -p gitcanvas-core`, `cargo test -p gitcanvas --lib`, Clippy y bindings aprobados.
- [x] **WT-2 — Preferencias compartidas y migración.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#wt-2--preferencias-compartidas-y-migracion), [ADR 0006](docs/adr/0006-workspace.md), [ADR 0007](docs/adr/0007-stable-branch-graph.md). Esquema 2→3, precedencia principal/fallback activo, preferencias compartidas por directorio Git común y filtros durables por worktree. Pruebas de migración y fallos atómicos Rust y pruebas de precedencia/fallback frontend aprobadas.
- [x] **FLT-1 — Filtrado del historial completo.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#flt-1--filtrado-del-historial-completo), [roadmap](docs/plan/2026-10-19-roadmap-de-versiones.md), [ADR 0007](docs/adr/0007-stable-branch-graph.md). Rust resuelve ramas, tags y HEAD contra snapshot; scope/cursor inmutables; merges deduplicados, más de 500 commits, cursor obsoleto y detalle fuera de alcance con aviso cubiertos por pruebas.
- [x] **FLT-2 — Estado, persistencia y deshacer.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#flt-2--estado-persistencia-y-deshacer), [especificación D01–D50](docs/plan/2026-10-18-panel-izquierdo-ui-ux.md), [ADR 0006](docs/adr/0006-workspace.md). Filtros por worktree, referencias nuevas activas, acciones y undo de 50 pasos por worktree/sesión; cobertura de slice e integración incluida en las 831 pruebas frontend.
- [x] **SID-1 — Organización e interacción del panel.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#sid-1--organizacion-e-interaccion-del-panel), [especificación D01–D50](docs/plan/2026-10-18-panel-izquierdo-ui-ux.md), [`CONTEXT.md`](CONTEXT.md), [`CLAUDE.md`](CLAUDE.md). Búsqueda de sesión, secciones, carpetas virtuales, contadores, tri-state, acciones limitadas a coincidencias e inglés/español.
- [x] **WT-3 — Panel de worktrees, pestañas y checkout.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#wt-3--panel-de-worktrees-pestanas-y-checkout), [ADR 0006](docs/adr/0006-workspace.md), [`CONTEXT.md`](CONTEXT.md). Apertura validada y sin duplicar, estado de ramas ocupadas, grupos contiguos sin alterar el orden global, checkout explícito separado.
- [x] **SID-2 — Indicador de filtros en el diff.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#sid-2--indicador-de-filtros-en-el-diff), [especificación D01–D50](docs/plan/2026-10-18-panel-izquierdo-ui-ux.md). Apertura temporal sin perder diff/posición ni alterar fijación; prueba AppShell incluida.
- [ ] **V05-VERIFY — Verificación y cierre documental (seguimiento de gates externos).** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#v05-verify--verificacion-y-documentacion-de-cierre), [evidencia v0.5](docs/verification/v0.5.md), [verificación v0.4](docs/verification/v0.4.md), [`CLAUDE.md`](CLAUDE.md). v0.5.0 ya está publicada. Verificado localmente: macOS (831 pruebas frontend, ocho specs E2E nativos), Linux arm64 (830 pruebas frontend, ocho specs/20 recorridos E2E, Rust, Clippy y build), compilación cruzada MSVC (check, Clippy estricto, tests `--no-run` y enlace release), temas, idiomas, 940×600 e indicador del diff. **Pendiente, sin evidencia:** E2E en Windows nativo y prueba con lector de pantalla real; los intentos con VoiceOver solo confirmaron árbol de accesibilidad y foco de teclado, no anuncios. No se declaran verificados.

Crear o retirar worktrees sigue reservado para una entrega futura sin versión asignada;
preparación por líneas, amend y commits permanecen después de v0.11/v0.12 según el
roadmap.

### v0.6 — Historial por archivo

Estrategia aprobada el 2026-11-01 sobre el [roadmap](docs/plan/2026-10-19-roadmap-de-versiones.md#dependencias-y-criterios-de-versiones-posteriores).
Decisiones (inicio en HEAD con `focus_commit`, vista que reemplaza el gráfico, aviso «Actualizar», caché propia, rutas UTF-8 exactas, aviso en repos superficiales y criterios de rendimiento medibles: ver plan, decisiones 5–13; la vista no se persiste entre reinicios): seguir renombrados por similitud de `git2` (umbral predeterminado de Git, 50%)
con límites y corte explícitos; acción «Historial del archivo» en inspector y lista de
archivos que abre una vista dedicada en la pestaña, sin modificar filtros del gráfico y con
aviso si el commit queda fuera del alcance actual; merges con la semántica de
`git log -- <ruta>` (simplificación por defecto); rutas eliminadas consultables. Sin blame,
comparación de commits ni escrituras Git. Leer [ADR 0002](docs/adr/0002-local-file-safety-and-resource-budgets.md),
[ADR 0006](docs/adr/0006-workspace.md), [ADR 0007](docs/adr/0007-stable-branch-graph.md),
`CONTEXT.md`, `ARCHITECTURE.md` y `CLAUDE.md` antes de cada tarea. Plan detallado:
[implementación v0.6](docs/plan/2026-11-01-v0.6-implementacion.md); contrato técnico en [ADR 0008](docs/adr/0008-per-file-history.md).

- [x] **REC-1 — Reconciliar el estado de v0.5 con la release publicada.** Cabecera, siguiente paso, V05-VERIFY, verificación y plan de v0.5, SNAPSHOT y CLAUDE.md. Gates sin evidencia conservados como seguimiento. → `docs: reconcile v0.5 release status and pending verification gates`
- [x] **FH-0 — Contrato técnico y plan.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-0--contrato-tecnico-y-plan), [ADR 0008](docs/adr/0008-per-file-history.md). Plan de v0.6, ADR 0008 (simplificación, renombrados, límites explícitos, cursor sin estado) y matriz de casos de referencia; los fixtures ejecutables se crean con cada tarea de motor. → `docs(file-history): define the per-file history contract in adr 0008`
- [x] **FH-1 — Motor: historial por ruta.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-1--motor-historial-por-ruta), [ADR 0008](docs/adr/0008-per-file-history.md). Extrae el generador de ids de `history.rs` sin cambiar el grafo; módulo `file_history.rs` con simplificación, cursor sin estado y límites con motivo explícito. Aceptación: matriz sin renombrados y fixture de 10.000 commits. *Decisiones al implementar:* `history.rs` extrae `topological_walk` y `with_walk`, el único productor de ids para el grafo y para el historial por archivo; el grafo conserva sus presupuestos. `file_history.rs` aplica la simplificación de `git log -- <ruta>` con cursor `scope:último:frontier` (sin estado en el servidor), límites publicados en la respuesta y `focus_commit` con tres resultados (`found`, `not_shown`, `outside_budget`). La validación de ruta sale de `repository::validate_relative_path` (antes privada en `worktree.rs`). El presupuesto cuenta commits examinados, como la matriz del ADR 0008. La caché propia (500.000 ids) es una instancia de `HistoryReader` que posee el llamador; al ser otra instancia no comparte presupuesto con el grafo, pero no hay prueba de expulsión: queda garantizado por construcción.
      *Evidencia:* 19 pruebas de la matriz sin renombrados: fusión idéntica al primer padre, resolución, octopus, rama lateral conservada y revertida, cambio de modo, borrado y recreación, rutas inválidas, paginación con tamaños 1/2/7/200 idéntica a la completa, caché igual que sin caché, límites de trabajo y de frontier, cursor de otra ruta, `focus_commit` en los tres resultados. Benchmark del fixture de 10.000 commits (`cargo test -p gitcanvas-core --release -- --ignored --nocapture`): primera página 557 ms (objetivo < 1,5 s) y página con caché 189 ms (objetivo < 250 ms); antes de memorizar las entradas por pasada la primera página tardaba 3,8 s. `cargo clippy --workspace --all-targets -- -D warnings` y `cargo test -p gitcanvas-core` aprobados. No hay pruebas de repositorio superficial (`is_shallow`) ni sobre repositorios empaquetados reales.
      → `feat(core): walk the history of a single path with bounded work`
- [x] **FH-2 — Renombrados.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-2--renombrados), [ADR 0008](docs/adr/0008-per-file-history.md). `find_similar` al aparecer la ruta como añadida, `path_at_commit`/`renamed_from` por fila, configuración compartida con `diff.rs`, topes y cortes explícitos. *Decisiones al implementar:* la ruta rastreada cambia por commit: el frontier guarda, para cada commit seguido, el nombre con el que llega (primera llegada gana) y el cursor añade el número de renombrados seguidos (`scope:último:renombrados:frontier`, con rutas en hexadecimal, sin colisiones con separadores y ≤ 1 MiB). La búsqueda solo ocurre cuando la ruta aparece en un commit de un solo padre y no existía en el primero; en fusiones no se busca. La detección se extrae a `diff::find_renames` (solo renombres, similitud 50 %) y la usan los diffs de commit y el historial por archivo. El tope de 32 renombres y el de 2.000 archivos cambiados aparecen como `lineage` en la fila donde cortan, y `path_at_commit` y `renamed_from` van en cada fila.
      *Evidencia:* 9 pruebas nuevas de la matriz de renombrados: renombrado exacto con nombre por fila, renombrado con ediciones por encima del umbral, reemplazo disimilar que termina la cadena, renombrado dentro de fusión no buscado, tope de 32 renombrados con aviso, commit con más de 2.000 archivos con búsqueda omitida, paginación con tamaños 1 y 3 idéntica a la completa, caché igual que sin caché, y ida y vuelta del frontier con separadores en el nombre. 28 pruebas de `file_history` y suite de `gitcanvas-core` aprobadas; `cargo clippy --workspace --all-targets -- -D warnings` limpio. Benchmark de 10.000 commits tras el cambio: primera página 740 ms (objetivo < 1,5 s), con caché 182 ms (objetivo < 250 ms).
      → `feat(core): follow renames within explicit similarity and budget limits`
- [x] **FH-3 — IPC y autorización.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-3--ipc-y-autorizacion), [ADR 0008](docs/adr/0008-per-file-history.md). `get_file_history` con autorización canónica, wrapper en `lib/ipc`, invariantes de comandos y bindings sin deriva. *Decisiones al implementar:* `get_file_history` sigue el patrón de `get_commits`: `read` + `with_repo`, de modo que la ruta del repositorio se autoriza antes de tocar Git. La caché es una instancia propia (`FileHistoryCache`, 500.000 ids) registrada como estado aparte, así que nunca comparte presupuesto con la del grafo. Los límites publicados viajan en la respuesta (`limits`), y los tipos de FH-1 y FH-2 salen en `bindings.ts` sin tocar lo existente.
      *Evidencia:* prueba de despacho real: un repositorio sin abrir devuelve `InvalidRepository` y, abierto, devuelve la fila con `path_at_commit` y `limits.max_renames = 32`; invariantes de comandos (`every_tauri_command_runs_through_the_runtime_gate`, `ipc_registry_matches_every_command_and_safe_handlers_dispatch`) aprobadas; `bindings.ts` regenerado con solo 99 líneas añadidas. Wrapper `getFileHistory` en `lib/ipc` con su entrada en la tabla de pruebas; 851 pruebas de frontend, tipos, ESLint y Prettier aprobados; `cargo clippy --workspace --all-targets -- -D warnings` limpio.
      → `feat(ipc): expose per-file history through authorized commands`
- [x] **FH-4 — Estado frontend.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-4--estado-frontend), [ADR 0008](docs/adr/0008-per-file-history.md). Vista en `Navigation` (sin persistir), consultas por repositorio, ruta y commit de inicio, liberación en cierre/LRU y aislamiento entre pestañas. *Decisiones al implementar:* `Navigation` suma `fileHistory` (ruta, commit de inicio, fila elegida y aviso `stale`) con transiciones puras: `openFileHistory`, `closeFileHistory`, `selectFileHistoryRow`, `setFileHistoryStale`, `refreshFileHistory` y `retainFileHistorySelection`. La fila elegida sobrevive a un refresco; la comprobación contra el historial cargado se hace al final, porque antes no se sabe si la fila sigue listada. La clave es `["file-history", root, ruta, inicio]`: el cierre (`removeProjectQueries`) y el LRU de WS-14 (`removeHeavyProjectQueries`) la liberan sin código nuevo, y la consulta es inmutable por commit de inicio (`staleTime` infinito). La persistencia sigue siendo una proyección explícita, así que la vista nunca llega a disco.
      *Evidencia:* 8 pruebas de transiciones (apertura idempotente, selección que no toca la vista, aviso, refresco, retención de la fila y cierre), 4 de la consulta (sin vista no lee, paginación con cursor, aislamiento entre proyectos con la misma ruta e inicio), 2 de liberación (cierre y tope LRU de cinco inactivos) y 2 de la proyección guardada. 867 pruebas de frontend, `tsc`, ESLint del proyecto completo y Prettier aprobados.
      → `feat(file-history): keep per-tab file history state and queries`
- [x] **FH-5 — Vista y puntos de entrada.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-5--vista-y-puntos-de-entrada), [ADR 0008](docs/adr/0008-per-file-history.md). Inspector y cambios locales, lista virtual de commits, diff/contenido con `FileDiffView`, avisos de límites, de alcance y de merge. *Decisiones al implementar:* `FileHistoryView` ocupa el área del gráfico mientras `navigation.fileHistory` esté abierto; el panel derecho sigue mostrando el commit seleccionado. Cada fila es un commit del archivo; la fila elegida muestra su cambio con `FileDiffView` (reutilizado vía `FileDiffView/lazy.ts`, que ahora comparten `AppShell` y la vista). La lista es virtual con altura fija. El origen de cada punto de entrada lo decide su panel: el commit para el commit, HEAD para cambios locales (`followsHead`, que solo activa el aviso «Actualizar» cuando HEAD se mueve). La disponibilidad sale de `fileHistoryUnavailable` (sin commits, o ruta con U+FFFD). Avisos: superficial, límite de trabajo (carga más), frontier, lineage de renombrados por fila, fusión y «fuera del alcance» (sin «Mostrar en el gráfico»). «Cambios locales» cierra la vista y abre el archivo local. El árbol completo de un commit no ofrece la acción todavía; queda fuera de este alcance.
      *Evidencia:* 7 pruebas de componente de la vista (notas de fila, selección y salto al gráfico, fuera de alcance, volver, actualización desde HEAD, paginación con límite, cambios locales), 1 de integración con `AppShell`, 2 del punto de entrada en cambios locales (desde HEAD y repositorio sin commits), 1 del punto de entrada en el commit, 3 de la regla de disponibilidad y las pruebas existentes de los paneles ajustadas a la fila que ahora tiene su acción. 882 pruebas de frontend, `tsc`, ESLint y Prettier aprobados; el CSS nuevo entra en la prueba de propiedades lógicas. No hay comprobación visual en la aplicación real: queda para FH-6 (E2E nativo, 940×600 y temas).
      → `feat(file-history): add the file history view and entry points`
- [x] **FH-6 — Accesibilidad, i18n y E2E.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-6--accesibilidad-i18n-y-e2e), [ADR 0008](docs/adr/0008-per-file-history.md). Teclado/ARIA, inglés/español, ambos temas, 940×600 y spec nativo con modificación, renombrado, borrado y merge. *Decisiones al implementar:* cada acción «Historial» se nombra con su archivo («Historial de src/app.ts») para que un lector de pantalla distinga las filas. La lista de historial tiene navegación con teclado de foco itinerante: flechas, Re Pág/Av Pág, Inicio y Fin; el foco espera a que el virtualizador dibuje la fila destino. La tecla se resuelve en la función pura `keyTarget`. El fixture `file-history` (`wdio.conf.ts`) reproduce la historia con modificación, fusión con conflicto resuelto (la fusión difiere de ambos padres), renombrado exacto y borrado en HEAD; el runner lo asigna a `e2e/file-history.spec.ts`.
      *Evidencia:* prueba de teclado en componente y 884 pruebas de frontend, `tsc`, ESLint y Prettier aprobados. Spec nativo ejecutado en macOS (WebKit, build `e2e` de release): 5 de 5 pasan, incluidos renombrado, borrado con fusión, navegación por teclado, salto al gráfico y desbordamiento en 940×600 en claro y en oscuro. Capturas de ambos temas revisadas.
      *Sin verificar:* el spec nativo corre en español; el inglés queda cubierto por el catálogo y la prueba de literales, no por recorrido nativo. Lector de pantalla real (VoiceOver no anunció la lista en esta sesión) y ejecución nativa en Windows quedan como límites declarados para FH-7.
      → `test(e2e): cover file history across themes and languages`
- [x] **FH-7 — Verificación y documentación.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-7--verificacion-y-documentacion), [ADR 0008](docs/adr/0008-per-file-history.md). `docs/verification/v0.6.md`, CHANGELOG en `Unreleased`, ARCHITECTURE, CONTEXT, PRODUCT, DESIGN y README. *Decisiones al implementar:* la evidencia y sus límites viven en `docs/verification/v0.6.md`. Los documentos de producto se actualizan en lo que cambia: CHANGELOG (`Unreleased`), ARCHITECTURE (historial por archivo y caché propia), CONTEXT (vista y alcance), PRODUCT (capacidad de solo lectura), DESIGN (vista, teclado y etiquetas) y README (límites conocidos). La versión de los manifiestos sigue en 0.5.0 hasta el release.
- [x] **FH-8 — Contenido anterior de archivos borrados.** [Plan](docs/plan/2026-11-01-v0.6-implementacion.md#fh-5--vista-y-puntos-de-entrada) (criterio de FH-5). En un commit que borró el archivo, el modo «Antes del borrado» muestra la versión del primer padre, con su commit en un aviso; antes el modo completo quedaba desactivado. → `feat(file-history): show the version before a deletion`
      *Decisiones al implementar:* la versión anterior se lee del primer padre con la misma consulta de contenido que el archivo completo; no hay un lector nuevo. Un commit raíz no puede borrar archivos, así que sin padre el modo queda desactivado. Los cambios locales borrados no cambian.
      *Evidencia:* 19 pruebas de `FileDiffView` (la prueba que afirmaba que no había modo completo para borrados se reemplazó por la que lo verifica) y 884 pruebas de frontend, `tsc`, ESLint y Prettier aprobados. No se repitió el E2E nativo: este cambio no toca el spec `file-history`, pero el binario instalado de 0.6.0 no incluye FH-8.
      *Evidencia:* suites de Rust (263), frontend (884), lint, tipos y formato aprobados; `cargo deny` aprobado tras el bump de `libz-sys` (commit aparte); `npm audit --omit=dev` sin vulnerabilidades; build de producción macOS arm64 con firma local válida. E2E nativo completo en macOS (WebKit): 9 specs y 25 pruebas pasando, incluido `file-history`. Límites declarados: lector de pantalla real, Windows nativo, inglés en el recorrido nativo, repositorios superficiales y empaquetados reales, y firma del updater (solo en CI).
      → `docs(file-history): record verification and update product docs`

### Entregas posteriores

v0.5 panel/filtros y worktrees (publicada) → v0.6 historial por archivo → v0.7 stash de solo lectura →
v0.8 contribuyentes/releases →
v0.9 proveedores → v0.10 crear/conectar repositorios → v0.11 gestión de ramas →
v0.12 preparar/crear commits. Objetivos de planificación, sin fechas ni bumps.
Desglosar cada entrega al prepararla siguiendo el roadmap y los acuerdos existentes.

### Seguimiento histórico de v0.3

Las secciones siguientes conservan decisiones y evidencia de su momento. En caso de
contradicción de alcance/estado, prevalecen el roadmap vigente y la cabecera actual.

### Workspace: pestañas, favoritos y persistencia

Origen: sección 4 del [plan de tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md).
Objetivo: **v0.3.0**. Cada tarea deja la aplicación funcional y verificable, sin adaptadores
temporales ni estado duplicado. Las decisiones que la definen están al final de esta sección.

*Punto de partida (2026-10-13):* `state/session.ts` guarda un único `repository` más la
selección, el reveal y el archivo expandido; `AppShell`, `HistoryView`, `Sidebar` y
`FileDiffView` lo leen. Las consultas ya están indexadas por ruta (`queryKeys.ts`), el
backend ya autoriza por ruta canónica (`AllowedRepos`) y observa un solo repositorio
(`ActiveWatch`). La protección de la caché de clones conserva una sola ruta activa
(`commands/github.rs`). Hay estado de vista en componentes (`CommitSearch`,
`ChangedFilesBrowser`, `sidebarPinned` en `AppShell`), `worktree.ts` usa `keepPreviousData`
(muestra los archivos del proyecto anterior mientras carga el nuevo), la toolbar tiene los
botones de GitHub y de abrir carpeta, y la app usa el menú nativo por defecto de Tauri.

- [x] **WS-1 — Registro backend de repositorios abiertos.** Estado `OpenRepos` en Tauri y un
      comando `sync_open_repositories(paths)` que **reemplaza el conjunto completo** (idempotente:
      no hay apertura y cierre incrementales que puedan desviarse). Lo protegido son las
      **pestañas abiertas**, estén o no ya revalidadas. Las rutas pasan por la misma
      canonicalización que `with_repo`. `clone_github_repository` deja de recibir
      `active_repository_path` y conserva toda entrada de caché presente en el registro, además
      del clon nuevo. Una ruta inexistente se ignora para protección sin error.
      *Pruebas:* un clon abierto en una pestaña inactiva sobrevive a la retención; alias y
      rutas inexistentes; reemplazo del conjunto; bindings regenerados sin deriva.
      → `feat(workspace): protect every open clone from cache retention`

- [x] **WS-2 — Almacén persistente del workspace en Rust.** `workspace.json` en el directorio de
      datos: esquema con `version`, pestañas (ruta, orden, navegación), pestaña activa,
      favoritos y recientes (máximo 20). Un único escritor (cola serializada), escritura a
      archivo temporal en el mismo directorio y reemplazo atómico, límites de tamaño, de
      longitud de ruta y de pestañas (30), y validación al leer. Datos corruptos o de una
      versión futura se conservan como `workspace.json.corrupt-<fecha>` y se arranca vacío con
      el fallo reportado; nunca se pierden en silencio. Comandos `load_workspace` y
      `save_workspace` con tipos Specta. Nada leído de disco autoriza operaciones Git.
      La variable `GITCANVAS_DATA_DIR` sustituye el directorio de datos completo (almacén,
      clones y registros), igual que `GITCANVAS_REPOSITORY` ya sustituye el argumento de
      arranque; `wdio.conf.ts` la apunta a un directorio temporal para que el E2E nunca lea ni
      escriba la sesión real del usuario.
      *Pruebas:* ida y vuelta, escritura interrumpida (el original sigue válido), corrupción,
      versión desconocida, límites, escrituras concurrentes, sustitución del directorio.
      *Decisiones al implementar:* el almacén vive en `gitcanvas-core` (`workspace/`), que ya aloja
      la caché de clones y las credenciales y sigue sin depender de Tauri; los límites (30
      pestañas, 20 recientes, 200 favoritos, 4096 bytes por ruta) son constantes de ese módulo y
      `load_workspace` los devuelve para que la interfaz no guarde otra copia. `save_workspace`
      lleva una `revision` y el almacén omite la que sea más antigua que la última aplicada, igual
      que `sync_open_repositories`, porque dos guardados pueden llegar en otro orden. Los datos
      ilegibles se apartan en `workspace.json.corrupt-<fecha>` (se conservan los 3 más
      recientes) y se informan con `recovery`.
      *Hallazgo durante la ejecución:* `cargo deny` empezó a fallar por cuatro avisos nuevos
      (RUSTSEC-2026-0346 a 0349) en `rustls 0.23.45`, la librería TLS de las llamadas a GitHub; se
      corrigió aparte con `chore(deps): update rustls to 0.23.46 for four tls advisories`
      (`428b2ad`). Dos veces se coló en un commit una eliminación ya preparada en el índice:
      antes de cada commit se revisa `git diff --cached --stat`.
      → `feat(workspace): persist tabs, favorites and recents in a versioned store`

- [x] **WS-3 — Workspace en el frontend.** `state/workspace.ts` reemplaza la sesión global:
      pestañas ordenadas, pestaña activa y una sesión por **raíz canónica del worktree**
      (`RepositoryInfo.path`). La sesión conserva selección, reveal y archivo expandido; las
      acciones se dirigen a una raíz explícita, así un resultado tardío nunca se aplica a la
      pestaña activa por accidente. `useSession` pasa a ser un selector de la sesión activa y
      se migran todos sus consumidores. Tope de **30 pestañas**: superarlo no abre ninguna y
      muestra un aviso traducido que ofrece cerrar una; nunca se cierra una por su cuenta.
      Sin sesión de repositorio global.
      *Pruebas:* las de `session.test.ts` reescritas sobre el workspace; sesiones aisladas;
      acción sobre una pestaña no activa; cerrar la activa elige vecina; tope de 30.
      *Decisiones al implementar:* `state/session.ts` pasa a ser `state/navigation.ts`: el modelo de
      navegación de un proyecto como datos con transiciones puras. `state/workspace.ts` guarda las
      pestañas y la activa; la interfaz lee con `useActiveRepository`, `useNavigation` y
      `useNavigationActions`, y estas últimas quedan **atadas a la raíz que su vista renderizó**, de
      modo que un callback tardío no toca otra pestaña. El tope (30) llega del backend con el
      comando nuevo `get_workspace_limits`, que sale de `LoadedWorkspace` porque no depende de lo
      guardado, y `WorkspaceGate` retiene la interfaz hasta conocerlo. `openProject` ya reutiliza la
      pestaña de un proyecto abierto y el sincronizador de WS-1 envía todas las rutas abiertas.
      *Estado intermedio:* hasta WS-8 no hay barra de pestañas, así que abrir un segundo proyecto
      lo activa pero no se puede volver al primero; `dev` no es publicable hasta entonces.
      → `refactor(workspace): replace the single-repository session with per-tab sessions`

- [x] **WS-4 — Un solo flujo de apertura.** `openProject(info)` es la única puerta: el selector
      nativo, el repositorio de línea de comandos, el clon de GitHub y la restauración. Si la
      raíz ya está abierta, activa su pestaña; dos worktrees del mismo repositorio son pestañas
      distintas; una pestaña nueva va al final. Un repositorio explícito al iniciar se abre y se
      activa sin descartar sesiones ya presentes. La vista de clonado de GitHub pasa a ser
      estado de la aplicación (no de una pestaña): abrirla no altera ninguna sesión. Cada cambio
      de pestañas llama a `sync_open_repositories` (WS-1).
      *Pruebas:* alias y duplicados, worktrees vinculados, apertura desde el clon, inicio con
      argumento y sesión restaurada, sincronización con el backend.
      *Decisiones al implementar:* `openProject` ya existía desde WS-3 con la reutilización de pestañas
      y el sincronizador de WS-1 ya enviaba todas las rutas; WS-4 agrega `openProjectAt(path)`
      (`state/openProject.ts`), la única forma de convertir una carpeta en pestaña, usada por el
      selector, el clon de GitHub y, al llegar WS-11, la restauración. La pestaña se nombra por la
      raíz canónica que responde el backend, nunca por el texto recibido. La vista de GitHub pasa
      al estado del workspace. El repositorio de la línea de comandos se abre siempre junto a las
      pestañas presentes; solo cede si la persona abrió otro proyecto mientras tanto, y cambiar la
      navegación de una pestaña no cuenta como eso.
      → `feat(workspace): route every open through one entry that reuses existing tabs`

- [x] **WS-5 — Estado de vista por proyecto, fuera de los componentes.** Lo que hoy muere al
      cambiar de proyecto pasa a la sesión: consulta de `CommitSearch`, carpetas colapsadas y
      «mostrar todos» de `ChangedFilesBrowser`, ancla de scroll del historial (id de commit) y
      `sidebarPinned`. Solo se monta la vista activa. **Ancla:** se restaura únicamente si el
      commit ya está cargado; si no lo está (típico tras reiniciar, cuando solo existe la
      primera página), el historial empieza arriba y la selección y su panel de detalle se
      conservan, porque el detalle se pide por id. Sin cargas ocultas de páginas. Tamaños de
      panel, tema, idioma y modo de listado siguen siendo preferencias generales.
      *Pruebas:* cambiar de pestaña y volver conserva cada elemento; dos proyectos no comparten
      búsqueda ni carpetas; ancla cargada y no cargada.
      *Decisiones al implementar:* `Navigation` suma `searchQuery`, `collapsedFolders`,
      `showAllCommitFiles`, `historyAnchor` y `sidebarPinned`, con sus transiciones puras;
      `CommitSearch` pasa a ser controlado y `ChangedFilesBrowser` lee y escribe en la pestaña. El
      cuerpo de la ventana y el buscador llevan `key={repository.path}`: al cambiar de proyecto se
      reemplazan, así ningún estado local (scroll, foco, campo a medias) viaja de un proyecto al
      siguiente. El ancla se informa al asentarse el desplazamiento leyendo `scrollTop` del DOM al
      disparar el temporizador (las filas tienen altura fija) y no el estado del virtualizador, que
      se actualiza un cuadro después de una restauración; si la tabla se reemplaza antes de
      asentarse, el movimiento se informa igualmente. La restauración ocurre una vez, cuando hay
      las primeras filas, y cede ante un reveal pendiente. De `Navigation`, solo selección, ancla
      y carpetas colapsadas se guardan en disco (WS-11); el resto vive mientras dura la sesión.
      → `refactor(workspace): keep search, folders and scroll anchor in each tab session`

- [x] **WS-6 — Aislamiento de datos y de operaciones.** Quitar `keepPreviousData` de las
      consultas de `worktree.ts` que cruzan proyectos (los archivos de uno nunca aparecen ni
      habilitan acciones en otro); `useGitActions` pasa a estado por proyecto (aviso,
      ocupado, confirmación y bloqueo de checkout), y su resultado se aplica al proyecto que lo
      inició aunque haya cambiado la pestaña. Una pestaña con checkout, pull o push en curso no
      puede cerrarse. Las claves de consulta se mantienen por repositorio.
      *Pruebas:* respuesta tardía tras cambiar de pestaña; dos acciones en proyectos distintos;
      cierre bloqueado mientras escribe; sin datos del proyecto anterior durante la carga.
      *Decisiones al implementar:* `useGitActions` y sus tipos salen de `components/Toolbar` y pasan a
      `state/gitActions.ts` (comandos) y `state/gitActionState.ts` (modelo puro); el estado vive en
      `Tab.gitActions`. Un `run` único aplica las reglas de toda escritura: no arranca si el
      proyecto ya tiene una acción en curso, siempre limpia la marca de «en curso» y el resultado
      cae en el proyecto que lo inició. Antes, un resultado que llegaba tras cambiar de proyecto se
      descartaba y `busy` bloqueaba al otro proyecto; ahora cada uno tiene el suyo. `closeTab`
      devuelve `"busy"` y no cierra una pestaña que está escribiendo. `keepPreviousData` se
      reemplaza por un placeholder que solo presta la respuesta anterior del mismo proyecto; la
      prueba falla si se vuelve a la versión anterior.
      → `fix(workspace): bind queries and git actions to the project that started them`

- [x] **WS-7 — Observación del proyecto activo y verificación al activar.** Un único watcher y
      poller, solo para la pestaña activa (se reutiliza el control de generaciones); los
      inactivos no consultan. Al activar una pestaña: revalidar identidad con el flujo de
      apertura (que también la **autoriza** si venía de la restauración), releer ramas y etiquetas
      y la huella del árbol de trabajo; las acciones de escritura (checkout, pull, push) quedan
      deshabilitadas hasta terminar. El historial en caché se reutiliza si las referencias no
      cambiaron y se invalida si cambiaron.
      *Pruebas:* solo un watcher vivo tras varios cambios rápidos; referencias iguales
      reutilizan páginas; referencias distintas las invalidan; ruta desaparecida al activar;
      pestaña restaurada se autoriza al activarse.
      *Decisiones al implementar:* `Tab.verification` (`unverified`, `verifying`, `verified`,
      `unreachable`) y `verifyProject`: reabre la ruta con el flujo de apertura (que también la
      autoriza), exige que siga resolviendo a la misma raíz, relee ramas y etiquetas y las compara
      con las del caché; si coinciden conserva todas las páginas de historial ya cargadas y si
      difieren las descarta; el árbol de trabajo se relee siempre. Se ejecuta en cada activación
      (`useVerifyActiveProject`) y no se lanza dos veces para el mismo proyecto. `busy` incluye
      «no verificado», así que checkout, pull y push quedan deshabilitados hasta terminar. La
      consulta de ramas y etiquetas se define una sola vez (`branchesQuery`, `tagsQuery`) y la usan
      las vistas y la verificación. Si falla, la barra muestra el error con «Reintentar»; la
      recuperación completa de una pestaña inaccesible llega con WS-12. Ya había un solo watcher y
      poller, atados a la ruta activa, y los proyectos inactivos no tienen consultas observadas.
      *Observado:* en un E2E completo posterior a recompilar, `local-changes` falló una vez (el
      aviso del archivo desaparecido no llegó en 20 s); no se reprodujo en 8 corridas siguientes,
      con y sin la verificación, y se atribuye al primer arranque de un binario recién generado.
      → `feat(workspace): observe only the active tab and verify it on activation`

- [x] **WS-8 — Barra de pestañas y menú de apertura.** Componente accesible sobre la toolbar:
      pestañas, cierre, desbordamiento y un botón «+» que abre un **menú** (Abrir carpeta…,
      Clonar de GitHub…, Favoritos, Recientes); toda pestaña es un proyecto, no existe una
      pestaña vacía. Cada pestaña muestra su nombre y solo **estado operativo**: indicador de
      escritura en curso y marca de «sin verificar» o «inaccesible»; nada que pueda quedar
      obsoleto. Nombres repetidos se distinguen con la carpeta contenedora y el tooltip muestra la
      ruta completa. Los botones de GitHub y de abrir carpeta salen de la toolbar y quedan en el
      menú y en la pantalla de inicio, sin duplicados. Textos en los catálogos en inglés y
      español, CSS con propiedades lógicas, correcta a 940 px y en ambos temas.
      *Pruebas:* render y cierre, desbordamiento, nombres repetidos, textos largos, test de
      literales y de propiedades lógicas, toolbar sin los botones movidos.
      *Decisiones al implementar:* `TabBar` solo aparece con al menos un proyecto; sin proyectos queda
      la pantalla de inicio, que ahora lleva Abrir carpeta y Clonar de GitHub. La apertura de
      carpeta se extrae a `useOpenFolder` (protección contra un segundo panel, recordar el
      directorio, fallo) y la usan la pantalla de inicio y el menú «+», que nunca están a la vez.
      Las pestañas desbordan con desplazamiento horizontal y un botón «Todos los proyectos
      abiertos» lista todas, sin medir anchos; los nombres repetidos se distinguen con la carpeta
      (`labelTabs`) y, si tampoco basta, con la ruta completa. Los glifos de cerrar, agregar y la
      lista se dibujan con CSS, así que no hay caracteres que traducir. Cada pestaña es un
      `tablist` con tabulación itinerante; flechas y atajos llegan con WS-9.
      *Hallazgo durante la ejecución:* la vista de GitHub se cerraba con el botón de la barra, que
      ya no existe; ahora tiene su propio botón «Volver».
      → `feat(workspace): add an accessible tab bar with an open menu`

- [x] **WS-9 — Reordenar y teclado.** Reordenar por arrastre y por teclado; patrón WAI-ARIA de
      pestañas (`tablist`, foco itinerante, foco visible). Atajos manejados en la página:
      recorrer (Ctrl+Tab y Ctrl+Mayús+Tab), saltar a la pestaña N (⌘/Ctrl+1–8, 9 a la última) y,
      en Windows y Linux, abrir (Ctrl+O) y cerrar (Ctrl+W). No se interceptan al escribir en
      campos de texto. Todos llaman a las mismas acciones del workspace que usa WS-10.
      *Pruebas:* recorrido completo solo con teclado, atajos con foco en un campo, reorden y
      persistencia del orden en la sesión.
      *Decisiones al implementar:* el arrastre usa eventos de puntero, no HTML5 drag and drop: Tauri
      deja `dragDropEnabled` activo por defecto y en WebView2 eso impide los eventos de arrastre
      HTML5. Una pestaña se intercambia cuando el puntero pasa de la mitad de su vecina (con
      histéresis; entrar en ella provocaba oscilaciones con anchos distintos) y se lee de la
      posición en pantalla, así que sirve también de derecha a izquierda. Teclado: flechas y
      Inicio/Fin mueven el foco sin activar (activar comprueba la carpeta, así que pide Enter),
      Alt+flechas reordena, Supr cierra la pestaña enfocada, y los botones de cerrar salen del
      orden de tabulación. Atajos en `shortcuts.ts` (función pura): Ctrl+Tab y ⌘/Ctrl+1–9 también
      funcionan al escribir, porque no significan nada para un campo; Ctrl+O y Ctrl+W no, y en
      macOS les corresponde el menú nativo de WS-10. Las acciones comunes viven en
      `state/tabCommands.ts` para que el menú de macOS las reutilice. `useOpenFolder` sube a
      `AppShell` y se pasa a la barra y a la pantalla de inicio: una sola instancia.
      → `feat(workspace): reorder tabs and drive them from the keyboard`

- [x] **WS-10 — Menú nativo propio en macOS.** El menú por defecto de Tauri liga ⌘W a «Cerrar
      ventana» antes de que la página lo vea, así que cerraría toda la ventana. Se construye un
      menú propio solo en macOS (Aplicación, Archivo con **Abrir** ⌘O y **Cerrar pestaña** ⌘W,
      Edición con los elementos predefinidos para que copiar y pegar sigan funcionando, Ventana)
      cuyos elementos emiten eventos que ejecutan las mismas acciones de WS-9. Los textos salen
      de los catálogos: el frontend los envía con un comando tipado al arrancar y en cada cambio
      de idioma (ADR 0004). Windows y Linux no tienen menú por defecto y siguen con los atajos
      de la página.
      *Pruebas:* comando de etiquetas (todas las claves presentes en ambos idiomas), reconstrucción
      al cambiar de idioma, ⌘W cierra la pestaña y no la ventana; verificación manual en macOS.
      *Decisiones al implementar:* el contenido del menú es dato puro (`menu.rs`: `full_spec`, `initial_spec`)
      y solo `to_native` habla con el sistema, porque `muda` exige el hilo principal y los tests
      corren en otros; el menú inicial no tiene Archivo, así que ⌘W y ⌘O no hacen otra cosa antes de
      conocer el idioma; no existe ningún elemento que cierre la ventana. Los textos salen del
      namespace `menu` y se reenvían al cambiar de idioma (`useNativeMenu`).
      *Pendiente de verificar:* el menú real en macOS (títulos, ⌘O y ⌘W) no se pudo comprobar en
      esta sesión (`osascript` sin permiso de accesibilidad); verificarlo a mano en WS-17.
      → `feat(workspace): own the macos menu so close tab and open use the standard shortcuts`

- [x] **WS-11 — Guardar y restaurar la sesión.** Cambios estructurales (abrir, cerrar, reordenar,
      activar) se guardan de inmediato; la navegación con debounce; todo se vacía al cerrar la
      ventana. Se persisten pestañas, orden, activa y navegación; nunca diffs, historiales ni
      operaciones en curso. Al iniciar se carga el almacén y se abre la pestaña activa por el
      flujo autorizado; las demás se restauran **perezosamente**: aparecen marcadas «sin
      verificar» y su ruta se revalida y autoriza solo cuando se activan (WS-7). Su ruta sí
      entra en `sync_open_repositories` para que su clon no se borre. Lo guardado nunca autoriza
      nada por sí solo.
      *Pruebas:* ida y vuelta con el almacén real, restauración con solo la activa validada,
      activación de una restaurada, ráfaga de navegación produce una sola escritura, vaciado al
      cerrar.
      *Evidencia:* proyección tipada de navegación, escritor serializado con debounce de 300 ms,
      restauración sin autorización y consultas bloqueadas hasta verificar. Cierre y salida del
      sistema pasan por el vaciado; si falla, la ventana permanece abierta. Pruebas de ráfagas,
      cambios durante escritura, fallo y reintento, cierre y restauración; suite frontend y Rust.
      → `feat(workspace): save and restore the session, validating tabs on first use`

- [x] **WS-12 — Pestañas recuperables y fallos de persistencia visibles.** Ruta desaparecida o
      repositorio inaccesible, detectada al activar: la pestaña se conserva con **Reintentar**,
      **Localizar** (elegir otra carpeta; si esa raíz ya está abierta en otra pestaña, se activa
      esa y se cierra la rota) y **Cerrar**. Un fallo de guardado o un almacén corrupto se
      muestra con `ErrorMessage` y la aplicación sigue funcionando en memoria.
      *Pruebas:* cada una de las tres acciones, Localizar hacia una raíz ya abierta, almacén
      corrupto al arrancar, fallo de escritura.
      *Evidencia:* recuperación en la vista principal; Localizar usa autorización y conserva la
      pestaña si falla o se cancela. Un destino abierto se reutiliza sin perder su sesión.
      Aviso de guardado con reintento y aviso de recuperación con ruta del original conservado;
      ambos permiten seguir trabajando. Pruebas de las acciones y de corrupción al iniciar.
      → `feat(workspace): keep unreachable tabs recoverable and surface storage failures`

- [x] **WS-13 — Favoritos y recientes.** Estrella en la pestaña y en el menú; pantalla de inicio
      (cero pestañas) con Abrir carpeta, Clonar de GitHub, favoritos y recientes. Favoritos por
      nombre (nombres repetidos desambiguados con la carpeta), recientes del más nuevo al más
      viejo con tope de 20, un favorito no se repite en recientes, sin reordenamiento manual.
      Favoritos y pestañas son independientes: cerrar una pestaña no borra el favorito. Un
      favorito o reciente cuya ruta no responde se muestra como inaccesible y se puede quitar.
      *Los clones guardados como favorito no se protegen de la retención* (decisión
      explícita): si el clon fue expulsado, la entrada queda inaccesible.
      *Pruebas:* alta, baja, orden, tope de 20, sin duplicados entre listas, persistencia, ruta
      desaparecida.
      *Evidencia:* estrella accesible en cada pestaña y acción por teclado en el menú;
      listas desde el menú y la pantalla de inicio, orden por nombre/último uso,
      desambiguación, límites del backend y errores recuperables. Pruebas de persistencia,
      cierre independiente, tope, orden, duplicados y rutas inaccesibles.
      → `feat(workspace): add favorites and a recent projects list`

- [x] **WS-14 — Liberar recursos al cerrar y acotar los inactivos.** Cerrar una pestaña quita
      su sesión, sus consultas (`removeQueries` por ruta con un helper en `queryKeys.ts`) y su
      entrada en el registro del backend. LRU explícito: se retienen consultas pesadas del
      proyecto activo y de **como máximo cinco** inactivos, además de `gcTime`; la activa nunca
      se expulsa. El presupuesto global de `HistoryReader` (8 instantáneas, 2 000 000 de ids)
      no cambia.
      *Pruebas:* cierre libera todo lo de esa ruta, el sexto inactivo expulsa al más antiguo,
      volver a uno expulsado carga normalmente, el activo nunca se expulsa.
      *Evidencia:* coordinador explícito por activación; retiene datos pesados de la activa y
      cinco inactivas, y solo referencias/huella de las demás. Cerrar elimina todos los tipos
      de consulta de esa raíz; la sincronización existente retira la protección del clon.
      Pruebas del sexto inactivo, reactivación, aislamiento y cierre completo.
      → `perf(workspace): release closed tabs and bound inactive project caches`

- [x] **WS-15 — E2E de varias pestañas.** Dos repositorios de fixture y un directorio de datos
      temporal (WS-2): abrir ambos, alternar sin mezclar historial ni cambios locales, reabrir
      un repositorio ya abierto sin duplicar, cerrar una pestaña, un favorito que sobrevive al
      cierre. Los cuatro specs existentes siguen pasando con su pestaña única.
      *Evidencia (macOS):* cinco specs, once pruebas nativas pasando; dos repositorios
      desechables, restauración inicial, alternancia, reapertura, cierre y favorito persistido
      por el almacén Rust. Capturas de ambos temas a 940×600 tras esperar el reajuste.
      *Hallazgo:* el directorio de datos Rust no aislaba localStorage del WebView; los binarios
      E2E ahora usan modo privado, con guardia Rust. El aviso de limpieza del mock store de
      WDIO aparece después de cerrar su sesión; no es un error de la aplicación.
      → `test(e2e): cover switching, reopening and closing tabs across two repositories`

- [x] **WS-11a — Detalle restaurado fuera de la página cargada.** Consultar metadatos del
      commit por id a través del motor y del flujo autorizado, sin paginar ocultamente.
      Conservar la selección y mostrar error/reintento cuando el objeto desaparezca.
      *Hallazgo:* AppShell solo resolvía la selección en las filas cargadas, aunque WS-5
      indicaba que el detalle se consultaba por id. Añadir prueba sobre un commit fuera del walk.
      *Evidencia:* metadatos inmutables por id, wrapper IPC generado, autorización probada;
      hook sin lectura previa a verificar y sin mezcla entre respuestas tardías. Pruebas
      del motor sobre un objeto fuera del walk y del inspector sin pedir otra página.
      → `fix(workspace): resolve restored commit details independently of history pages`

- [x] **WS-11b — Reinicio nativo después de un fallo de render.** El botón de recuperación
      debe reiniciar el proceso, conservando el último workspace durable. Recargar solo la
      página reinicia secuencias de solicitudes mientras Rust conserva revisiones y watcher.
      El reinicio requiere acción explícita y su fallo permanece visible.
      *Evidencia:* comando tipado de reinicio, adaptador nativo e IPC probado con ejecución
      inocua; el fallback espera si hay una escritura Git y conserva el error si el reinicio
      es rechazado. No recarga el renderer conservando secuencias backend antiguas.
      → `fix(workspace): restart the native process after a render failure`

- [x] **WS-11c — Separar el cierre nativo del arranque.** Clippy detectó que el arranque
      superó el límite de cien líneas al añadir coordinación del cierre. Extraer el manejador
      de salida al módulo nativo de ciclo de vida, sin alterar el comportamiento ni relajar reglas.
      → `refactor(lifecycle): isolate native shutdown routing from application setup`

- [x] **WS-13a — Regreso desde la biblioteca y listas extensas.** Activar una pestaña debe
      volver a su vista incluso si ya era la activa; Favoritos/Recientes no retienen la
      pantalla. La pantalla inicial debe permitir recorrer listas extensas sin ocultar
      controles ni comprimir el contenido. Pruebas de navegación y presentación nativa.
      *Hallazgo:* un argumento de arranque tardío podía volver a robar foco después de
      activar una pestaña existente; ahora también cede ante esa navegación explícita.
      *Evidencia:* activación de la pestaña actual sale de Favoritos/GitHub sin perder
      navegación; el argumento de arranque tardío cede ante activación explícita. Pruebas
      unitarias y E2E a 940×600 recorriendo doscientos favoritos hasta la última fila,
      sin desbordamiento horizontal ni controles inaccesibles.
      → `fix(workspace): return to tab views and keep project lists scrollable`

- [x] **WS-8a — Desbordamiento con treinta pestañas.** Acotar el menú a la ventana
      según dimensiones reales y permitir desplazamiento interior sin cerrarlo. Mantener
      el cierre al desplazarse fuera y el recorrido completo por teclado. Prueba unitaria
      y nativa con treinta pestañas restauradas.
      *Evidencia:* menú medido y acotado, scroll interior y teclado hasta la última fila;
      pruebas con treinta pestañas restauradas a 940×600. Los E2E comprueban título,
      contenido, ausencia de overlay y captura de errores/avisos del renderer.
      → `fix(workspace): bound overflow menus and preserve internal scrolling`

- [x] **WS-7a — Barrera de escritura síncrona al activar.** Marcar el destino pendiente
      antes de los efectos de React, incluida la vecina al cerrar y una recuperación.
      La comprobación espera una lectura explícita de la huella local, sin confiar en
      invalidar una consulta que todavía no tiene observadores. El ejecutor de escrituras
      también comprueba la verificación, para que un callback
      imperativo tardío no pueda omitir la barrera de la interfaz.
      *Evidencia:* activación, cierre y recuperación bloquean antes de los efectos;
      el ejecutor rechaza callbacks imperativos sin verificación. La huella local se espera
      explícitamente antes de habilitar. Pruebas de barrera, recuperación y lectura pendiente.
      → `fix(workspace): gate tab activation before asynchronous verification`

- [x] **WS-1a — Dependencias de caché y protección pendiente.** Resolver el directorio
      Git común de worktrees externos y la entrada contenedora de proyectos anidados.
      Una sincronización pendiente o metadatos irresolubles no permiten limpieza; la
      reparación de una entrada usada tampoco puede eliminar trabajo local.
      *Evidencia:* consulta del Git común con Git2, protección de contenedores anidados y
      rechazo de metadatos inciertos; marca de revisión recibida antes de esperar el permiso
      y comprobación de cambios durante la consulta. La reparación consulta protección antes
      de eliminar. Pruebas de worktree externo, informe pendiente y trabajo local conservado.
      → `fix(workspace): protect shared clone metadata and block unsafe cache replacement`

- [x] **WS-16 — Documentación.** ADR 0006 (workspace, identidad por raíz, almacén, restauración
      perezosa, menú de macOS y decisiones de este plan), ARCHITECTURE, CONTEXT (observación y
      registro de repositorios abiertos), PRODUCT, DESIGN (barra de pestañas), README, CLAUDE.md
      (el estado ya no es una sesión única) y CHANGELOG.
      *Evidencia:* ADR 0006 y documentación de arquitectura, producto, diseño, entrada de
      sesiones, README, snapshot y ficha sincronizados; CHANGELOG en Unreleased sin bump.
      Se distingue la implementación local de los instaladores v0.2.0 publicados.
      → `docs(workspace): record the tabs, favorites and persistence decisions in adr 0006`

- [ ] **WS-17 — Conciliar verificación y publicación de v0.3.0 (seguimiento histórico).**
      *Actualización 2026-10-19:* v0.3.0 y v0.3.1 ya publicadas; CI de v0.3.1 verde.
      GRF-0 debe conciliar evidencia y comprobaciones manuales antes de cerrar el ID.
      El alcance original se conserva a continuación como registro histórico.
      **Alcance original:** Corrida de `quality` sobre
      `dev` (matriz de tres sistemas, cobertura, Clippy, bindings sin deriva, E2E nativos) y
      validación manual del flujo de pestañas en cada sistema; en macOS, también ⌘O y ⌘W.
      Después, `/release` (versión confirmada con David).
      *Alcance autorizado (2026-10-14):* solo implementación y commits locales; push,
      PR, release y matriz remota quedan fuera. Esta tarea sigue abierta deliberadamente.
      *Evidencia local:* macOS; 706 pruebas frontend (95,17% statements, 96,61% líneas;
      todos los umbrales por módulo pasan), 204 pruebas Rust con todas las features;
      cinco specs/doce pruebas E2E, incluidos temas y 200 favoritos a 940×600. Tipos de
      frontend/E2E/config, lint, formato, Clippy estricto y bindings sin deriva.
      Compilación de producción completada en macOS, sin generar instaladores.
      `npm audit --omit=dev --audit-level=high` informa cero vulnerabilidades;
      `cargo deny` y `cargo audit` terminan correctamente, conservando ocho avisos
      transitivos permitidos por la política existente (incluido glib, dependiente de Tauri
      en Linux). No se relajan lints ni políticas para esta entrega.
      → `docs: close the workspace series and record the v0.3.0 verification`

### Endurecimiento previo a v0.3.0

Origen: auditoría del 2026-10-14 sobre `dev` (706 pruebas, matriz remota todavía sin correr).

- [x] **HRD-1 — Salida con plazo.** Si la interfaz no responde, cerrar la ventana (botón rojo o
      ⌘Q) no debe dejar la aplicación colgada. La interfaz confirma la petición de cierre con un
      comando que no pasa por las compuertas (una clonación larga las ocupa) y, si no llega en el
      plazo, el backend destruye la ventana. Un plazo vencido deja constancia en el registro.
      *Decisiones al implementar:* el cierre se vigila en `WindowEvent::CloseRequested`, no en
      `ExitRequested`, así que cubre el botón rojo, ⌘Q y el cierre pedido por la propia interfaz.
      `ShutdownGate` numera cada petición: una petición nueva releva a la vigilancia anterior y una
      confirmación llegada antes de empezar a esperar no se pierde. El plazo (3 s) es solo para
      *responder*; guardar no tiene plazo, porque lo acota el backend y un fallo deja la ventana
      abierta con el error visible. `acknowledge_shutdown` es la primera excepción a las
      compuertas de lectura y escritura, con su motivo en la prueba de invariantes.
      *Sin verificar en la aplicación real:* provocar un renderizador bloqueado exige permisos de
      accesibilidad que no hay en esta sesión; la lógica está cubierta por pruebas de la compuerta.
      → `fix(lifecycle): destroy the window when the interface never answers a close request`

- [x] **HRD-2 — Tabla de historial a ancho mínimo.** A 940×600 con el inspector abierto, hash y
      fecha desplazan el resumen del commit hasta hacerlo desaparecer. La tabla decide por su
      propio ancho (consulta de contenedor), no por el de la ventana: el resumen conserva un
      mínimo y las columnas secundarias ceden antes.
      *Decisiones al implementar:* la tabla es un contenedor (`container: commits / inline-size`) y
      sus filas cambian por su ancho, no por el de la ventana. Ceden, en este orden, el hash
      (760 px), el nombre del autor, con las iniciales (600 px), y la fecha (460 px); la lista de
      pistas se repite en cada paso porque una pista vacía conserva su espacio. El resumen no baja
      de 12 caracteres y los distintivos de ramas se encogen antes. Verificado a 940×600 con ambos
      paneles; `responsive.test.ts` fija el contrato del CSS.
      → `fix(history): keep the commit summary readable when the table is narrow`

- [x] **HRD-3 — Reemplazo de clones sin carrera.** La decisión de reemplazar una entrada de la
      caché lee las pestañas abiertas y la abre después otra pestaña. El registro de abiertos y
      el reemplazo se coordinan con el mismo cierre de entrada, de modo que abrir y reemplazar no
      se cruzan.
      *Decisiones al implementar:* la decisión y el borrado pasan a ser un solo paso. El núcleo recibe
      un `RemoveGuard`: se le entrega el borrado, no se le pregunta para actuar después, así que
      quien sabe qué entradas están en uso puede mantener esa respuesta mientras dura el borrado.
      `OpenRepos::remove_unless_open` comprueba que la entrada no esté abierta, la reclama contra la
      misma revisión del conjunto (si un reporte aplicó entre medias, no borra) y ejecuta el
      borrado **sin retener el registro**, que las marcas de petición necesitan sin esperar; mientras
      dura, los reportes de pestañas esperan (`Condvar`) y después encuentran la entrada ya
      ausente. Sirve igual al reemplazo de un clon ajeno y a cada expulsión de la retención, que
      ya no calcula una lista de protegidas por adelantado.
      → `fix(clone): make the replace decision and tab registration mutually exclusive`

- [x] **HRD-4 — Dividir el store del workspace.** `state/workspace.ts` mezcla pestañas,
      favoritos, recientes, errores de almacenamiento, vista de biblioteca y avisos. Se separa
      por responsabilidad, con un único punto de composición y sin cambiar su contrato.
      *Decisiones al implementar:* `state/workspace.ts` pasa de 498 a 162 líneas y se compone de cinco
      porciones en `state/workspaceStore/` (pestañas, biblioteca, vistas a pantalla completa,
      almacenamiento y límites). Sigue siendo **un** almacén con el mismo contrato: usar un
      proyecto toca pestañas, recientes y vistas a la vez y esas actualizaciones deben aterrizar
      juntas, así que las porciones se comparten solo funciones puras (`recentsAfterVisit`,
      `NO_FULL_VIEW`, `prepareActivation`) y cada acción hace un único `set`.
      *Hallazgo durante la ejecución:* activar una pestaña con los límites aún desconocidos
      vaciaba los recientes (`slice(0, 0)`); ahora la lista se conserva.
      → `refactor(workspace): split the workspace store into focused slices`

- [x] **HRD-5 — Ruido visual y menú «+».** La marca «sin comprobar» sale de las pestañas
      restauradas (el estado sigue en el tooltip y en la verificación); el menú «+» agrupa sus
      acciones y muestra el atajo de Abrir.
      *Decisiones al implementar:* **la decisión 4 de la serie WS cambia:** una pestaña «sin verificar» ya
      no lleva marca. Tras restaurar, todas lo están hasta que se muestran y cada activación la
      vuelve a marcar un instante, así que la marca era ruido y parpadeo, no información; quedan
      solo «escribiendo» e «inaccesible», lo que pide atención. `MenuItem` gana `shortcut` y
      `startsGroup` (separador con `role="separator"`), y el atajo se anuncia con
      `aria-keyshortcuts` en lugar de repetirse en el nombre accesible.
      → `refactor(tabs): quiet the unverified mark and group the open menu`

- [x] **HRD-6 — Reabrir la pestaña cerrada.** Una pila acotada de pestañas cerradas con su
      navegación; ⌘/Ctrl+Mayús+T la saca. El menú nativo de macOS la ofrece también.
      *Decisiones al implementar:* porción propia (`closedTabsSlice`): pila de diez pestañas cerradas, la más
      nueva primero y cada proyecto una vez, que `closeTab` alimenta en la misma actualización que
      el cierre y que **no se guarda en disco** (es memoria de la sesión). Reabrir devuelve la
      selección, la búsqueda y las carpetas, y la pestaña vuelve «sin verificar», porque la carpeta
      pudo cambiar; un proyecto que ya se abrió por otro camino se descarta de la pila y, con el
      tope de pestañas alcanzado, se avisa sin perder la entrada. Atajo Ctrl+Mayús+T (⇧⌘T en el menú
      nativo de macOS, que ya es dueño de ese acorde) y una entrada del menú «+» que solo existe si
      hay algo que reabrir.
      → `feat(workspace): reopen the most recently closed tab`

- [x] **HRD-7 — Menú contextual de pestaña.** Cerrar, cerrar las demás, cerrar las de la derecha
      y copiar la ruta; también con la tecla de menú. «Mostrar en el explorador» queda fuera a
      propósito: exigiría lanzar procesos (prohibido por Clippy) o ampliar los permisos del
      webview con un plugin.
      *Decisiones al implementar:* el menú se abre con `contextmenu`, que también lo que genera la tecla de
      menú o Mayús+F10 sobre una pestaña enfocada, así que no hay un camino aparte para teclado.
      Solo ofrece lo que haría algo («cerrar las otras» exige otras pestañas, «a la derecha» exige
      pestañas después). `closeOtherTabs` activa primero la pestaña elegida y `closeTabsAfter` solo
      la activa si la activa estaba entre las cerradas; ambas respetan una pestaña que escribe y
      alimentan la pila de reabrir. El fallo del portapapeles es un aviso (`notify`,
      `pathCopyFailed`), no un silencio.
      → `feat(tabs): add a tab context menu with close others and copy path`

- [x] **HRD-8 — Soltar una carpeta en la ventana.** La ruta soltada pasa por `openProjectAt`,
      que la valida en el backend como cualquier otra; nada soltado concede acceso.
      → `feat(workspace): open a folder dropped on the window`
      *Decisiones al implementar:* el evento de arrastre del SO llega con `getCurrentWebview().onDragDropEvent`
      (basta el permiso `core:event:default`); `useDroppedFolders` devuelve si hay un arrastre encima y
      `AppShell` muestra un aviso mientras tanto. `openDropped` abre las rutas en orden y se detiene al
      llegar al límite de pestañas; se ignora mientras otra apertura está en curso. La instancia de
      `UnreachableProject` no escucha soltados. Si el registro del listener falla, la app sigue sin
      esa función. *Observación:* el E2E `local-changes` falló una vez tras una compilación nueva (también
      en WS-7) y no se reprodujo en cuatro ejecuciones posteriores, ni con los logs capturados.

- [x] **HRD-9 — CHANGELOG y documentación.** Entradas en términos de lo que nota la persona;
      ADR 0006, ARCHITECTURE y DESIGN al día con la salida con plazo, las porciones del store y
      los casos de uso nuevos.
      → `docs(changelog): describe the unreleased changes in terms of what people notice`
      *Decisiones al implementar:* el CHANGELOG nombra capacidades y arreglos que la persona nota, sin
      clases internas; ADR 0006, ARCHITECTURE y DESIGN recogen la salida con plazo, las porciones del
      store, el borrado con `RemoveGuard` y los casos de uso de pestañas.

#### Decisiones cerradas (2026-10-14)

1. **El idioma, el tema y los tamaños de panel siguen en `localStorage`.** El ADR 0004 exige
   resolver el idioma antes del primer render y esa lectura es síncrona. El almacén de Rust
   guarda solo workspace, favoritos y recientes.
2. **Tope de 30 pestañas**, con aviso claro; nunca se cierra una por su cuenta.
3. **Restauración perezosa:** al arrancar solo se valida la pestaña activa; las demás se
   revalidan y autorizan al activarse y mientras tanto se marcan «sin verificar».
4. **Las pestañas muestran solo estado operativo** (escribiendo, sin verificar, inaccesible):
   rama y cambios locales de una pestaña inactiva podrían ser falsos.
5. **El «+» abre un menú y toda pestaña es un proyecto.** No existe la pestaña vacía.
6. **Los botones de GitHub y de abrir carpeta salen de la toolbar** y quedan en el menú «+» y en la
   pantalla de inicio.
7. **La retención de clones protege solo las pestañas abiertas.** Un favorito o reciente cuyo
   clon fue expulsado queda inaccesible (alternativa descartada: proteger favoritos).
8. **macOS recibe un menú nativo propio** con textos de los catálogos, para que ⌘W cierre la
   pestaña y ⌘O abra.
9. **El ancla del historial se restaura solo si su commit está cargado;** si no, el historial
   empieza arriba y la selección se conserva.
10. **LRU explícito de cinco pestañas inactivas** además de `gcTime`.
11. **Favoritos por nombre, recientes por último uso, sin duplicados y sin orden manual.**
12. **Los borradores de commit no entran en la 0.3** (todavía no existe la función); el
    esquema versionado deja espacio. Quedan fuera también la exclusión mutua de escrituras y
    los commits desde la interfaz (v0.4), y reabrir una pestaña cerrada.

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
