# TASKS — GitCanvas

> Fuente de verdad para el trabajo pendiente. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Tareas completadas, con su evidencia: [`ARCHIVES.md`](ARCHIVES.md).
> Planes: [endurecimiento H2](docs/plan/2026-10-04-plan-de-endurecimiento.md),
> [tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md) y el
> [plan general](docs/plans/2026-09-08-plan-de-implementacion.md).

**Estado al 2026-10-26:** v0.4.0 tiene tag y commit de release. H2, I18N y workspace
están implementados. La evidencia local de v0.4 está en
[`docs/verification/v0.4.md`](docs/verification/v0.4.md); sus verificaciones
externas/manuales sin evidencia siguen abiertas y no se consideran cerradas por la
release. La siguiente entrega funcional es v0.5: panel, filtros y navegación de
worktrees. La creación de commits permanece al final de la secuencia, objetivo v0.11.
El [roadmap vigente](docs/plan/2026-10-19-roadmap-de-versiones.md) prevalece sobre
asignaciones de versiones de planes anteriores.

**Estado de trabajo:** rama `dev`. La implementación v0.5 está integrada localmente;
los commits de esta entrega quedan en `dev` sin push. Se preservan `docs/audits/evidence/`
y `docs/media/`, que están sin seguimiento;
no agregarlas a commits de documentación. Inspeccionar estado e historial al retomar.
La versión de la aplicación no se cambia hasta preparar un release autorizado.

## Siguiente paso

Completar **V05-VERIFY** de v0.5 según el
[plan de implementación](docs/plan/2026-10-26-v0.5-implementacion.md#v05-verify--verificacion-y-documentacion-de-cierre).
Las puertas manuales de GRF-5 que carecen de evidencia se mantienen como seguimiento
separado; consultar [verificación v0.4](docs/verification/v0.4.md). La release v0.4.0
ya existe: no repetirla ni atribuir sus resultados a recorridos no comprobados.

## Cola de trabajo

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
- [ ] **V05-VERIFY — Verificación y cierre documental.** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#v05-verify--verificacion-y-documentacion-de-cierre), [evidencia v0.5](docs/verification/v0.5.md), [verificación v0.4](docs/verification/v0.4.md), [`CLAUDE.md`](CLAUDE.md). macOS desbloqueado: ocho specs E2E nativos pasaron, incluido `workspace`; el spec v0.5 tiene cuatro recorridos. Tema claro/oscuro, inglés/español, ventana 940×600 e indicador del diff están verificados. La suite frontend macOS pasó 831 pruebas en 87 archivos. Linux arm64: tipos, lint, 830 pruebas frontend, formato/Clippy/tests Rust y build pasaron; tras corregir el cierre prematuro del menú por el scroll de foco inicial, pasaron los ocho specs E2E (20 recorridos). El teardown de WDIO dejó advertencias sin afectar el resultado de la suite. Se autorizaron y retiraron imágenes Docker recuperables sin tocar contenedores ni volúmenes. Windows: con `cargo-xwin` y LLVM se aprobaron el check MSVC, Clippy estricto de todos los targets/features, la compilación de tests con `--no-run` y el enlace release del binario E2E; falta ejecutar en Windows nativo. El árbol AX expuso los controles v0.5; VoiceOver + panel de subtítulos se activaron durante el último intento y luego se restauraron apagados, pero CUA no expuso el texto hablado ni permite certificar anuncios/foco. Pendiente: E2E Windows nativo y comprobación con lector de pantalla real; no se declaran verificados.

Crear o retirar worktrees sigue reservado para una entrega futura sin versión asignada;
preparación por líneas, amend y commits permanecen después de v0.10/v0.11 según el
roadmap.

### Entregas posteriores

v0.5 panel/filtros y navegación de worktrees → v0.6 historial por archivo → v0.7 contribuyentes/releases →
v0.8 proveedores → v0.9 crear/conectar repositorios → v0.10 gestión de ramas →
v0.11 preparar/crear commits. Objetivos de planificación, sin fechas ni bumps.
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
