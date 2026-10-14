# TASKS — GitCanvas

> Fuente de verdad para el trabajo pendiente. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Tareas completadas, con su evidencia: [`ARCHIVES.md`](ARCHIVES.md).
> Planes: [endurecimiento H2](docs/plan/2026-10-04-plan-de-endurecimiento.md),
> [tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md) y el
> [plan general](docs/plans/2026-09-08-plan-de-implementacion.md).

**Estado al 2026-10-13:** v0.2.0 está publicado (tag sobre `main`, instaladores de Linux, macOS
y Windows), con la interfaz en inglés y español. La fase H2 (46 de 46) y la de
internacionalización (6 de 6) están cerradas y archivadas. La serie de auditoría posterior a v0.2.0 (8 de 8) está cerrada y archivada; la
sección 4 del plan de tres funcionalidades (pestañas, favoritos y persistencia) está planificada
como la serie WS y la sección 2 (commits desde la interfaz) todavía no tiene tareas.

**Estado del checkout:** `dev` está por delante de `main` (último release v0.2.0, PR #9) con el
resaltado de sintaxis, los logos por tema, la legibilidad del diff y la serie de auditoría, y
todavía no se publicó en `origin/dev`. Antes de editar, inspeccionar `git status` y el historial.

## Siguiente paso

Resolver las decisiones abiertas de la serie WS y empezar por **WS-1** y **WS-2** (backend,
independientes entre sí); después WS-3, que es la refactorización que desbloquea el resto.
Los commits desde la interfaz (sección 2 del plan) quedan para v0.4.

## Cola de trabajo

### Workspace: pestañas, favoritos y persistencia

Origen: sección 4 del [plan de tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md).
Objetivo: **v0.3.0**. Cada tarea deja la aplicación funcional y verificable, sin adaptadores
temporales ni estado duplicado. Las decisiones abiertas están al final de esta sección.

*Punto de partida (2026-10-13):* `state/session.ts` guarda un único `repository` más la
selección, el reveal y el archivo expandido; `AppShell`, `HistoryView`, `Sidebar` y
`FileDiffView` lo leen. Las consultas ya están indexadas por ruta (`queryKeys.ts`), el
backend ya autoriza por ruta canónica (`AllowedRepos`) y observa un solo repositorio
(`ActiveWatch`). La protección de la caché de clones conserva una sola ruta activa
(`commands/github.rs`). Hay estado de vista en componentes (`CommitSearch`,
`ChangedFilesBrowser`, `sidebarPinned` en `AppShell`) y `worktree.ts` usa
`keepPreviousData`, que muestra los archivos del proyecto anterior mientras carga el nuevo.

- [ ] **WS-1 — Registro backend de repositorios abiertos.** Estado `OpenRepos` en Tauri y un
      comando `sync_open_repositories(paths)` que **reemplaza el conjunto completo** (idempotente:
      no hay apertura y cierre incrementales que puedan desviarse). Las rutas pasan por la
      misma canonicalización que `with_repo`. `clone_github_repository` deja de recibir
      `active_repository_path` y conserva toda entrada de caché que esté en el registro, además
      del clon nuevo. Una ruta no autorizada se ignora para protección sin error.
      *Pruebas:* un clon abierto en una pestaña inactiva sobrevive a la retención; alias y
      rutas inexistentes; reemplazo del conjunto; bindings regenerados sin deriva.
      → `feat(workspace): protect every open clone from cache retention`

- [ ] **WS-2 — Almacén persistente del workspace en Rust.** `workspace.json` en
      `app_data_dir`: esquema con `version`, pestañas (ruta, orden, navegación), pestaña activa,
      favoritos y recientes (máximo 20). Un único escritor (cola serializada), escritura a
      archivo temporal en el mismo directorio y reemplazo atómico, límites de tamaño y de
      longitud de ruta, y validación al leer. Datos corruptos o de una versión futura se
      conservan como `workspace.json.corrupt-<fecha>` y se arranca vacío con el fallo
      reportado, nunca se pierde silenciosamente. Comandos `load_workspace` y `save_workspace`
      con tipos Specta. Nada leído de disco autoriza operaciones Git.
      *Pruebas:* ida y vuelta, escritura interrumpida (el original sigue válido), corrupción,
      versión desconocida, límites, escrituras concurrentes.
      → `feat(workspace): persist tabs, favorites and recents in a versioned store`

- [ ] **WS-3 — Workspace en el frontend.** `state/workspace.ts` reemplaza la sesión global:
      pestañas ordenadas, pestaña activa y una sesión por **raíz canónica del worktree**
      (`RepositoryInfo.path`). La sesión conserva selección, reveal y archivo expandido; las
      acciones se dirigen a una raíz explícita, así un resultado tardío nunca se aplica a la
      pestaña activa por accidente. `useSession` pasa a ser un selector de la sesión activa y
      se migran todos sus consumidores. Sin sesión de repositorio global.
      *Pruebas:* las de `session.test.ts` reescritas sobre el workspace; sesiones aisladas;
      acción sobre una pestaña no activa; cerrar la activa elige vecina.
      → `refactor(workspace): replace the single-repository session with per-tab sessions`

- [ ] **WS-4 — Un solo flujo de apertura.** `openProject(info)` es la única puerta: el selector
      nativo, el repositorio de línea de comandos, el clon de GitHub y la restauración. Si la
      raíz ya está abierta, activa su pestaña; dos worktrees del mismo repositorio son pestañas
      distintas. Un repositorio explícito al iniciar se abre y se activa sin descartar sesiones
      ya presentes. Cada cambio de pestañas llama a `sync_open_repositories` (WS-1).
      *Pruebas:* alias y duplicados, worktrees vinculados, apertura desde el clon, inicio con
      argumento y sesión restaurada, sincronización con el backend.
      → `feat(workspace): route every open through one entry that reuses existing tabs`

- [ ] **WS-5 — Estado de vista por proyecto, fuera de los componentes.** Lo que hoy muere al
      cambiar de proyecto pasa a la sesión: consulta de `CommitSearch`, carpetas colapsadas y
      «mostrar todos» de `ChangedFilesBrowser`, ancla de scroll del historial (id de commit) y
      `sidebarPinned`. Solo se monta la vista activa; al volver se recupera tal cual estaba.
      Tamaños de panel, tema, idioma y modo de listado siguen siendo preferencias generales.
      *Pruebas:* cambiar de pestaña y volver conserva cada elemento; dos proyectos no comparten
      búsqueda ni carpetas.
      → `refactor(workspace): keep search, folders and scroll anchor in each tab session`

- [ ] **WS-6 — Aislamiento de datos y de operaciones.** Quitar `keepPreviousData` de las
      consultas de `worktree.ts` que cruzan proyectos (los archivos de uno nunca aparecen ni
      habilitan acciones en otro); `useGitActions` pasa a estado por proyecto (aviso,
      ocupado, confirmación y bloqueo de checkout), y su resultado se aplica al proyecto que lo
      inició aunque haya cambiado la pestaña. Una pestaña con checkout, pull o push en curso no
      puede cerrarse. Las claves de consulta se mantienen por repositorio.
      *Pruebas:* respuesta tardía tras cambiar de pestaña; dos acciones en proyectos distintos;
      cierre bloqueado mientras escribe; sin datos del proyecto anterior durante la carga.
      → `fix(workspace): bind queries and git actions to the project that started them`

- [ ] **WS-7 — Observación del proyecto activo y verificación al activar.** Un único watcher y
      poller, solo para la pestaña activa (se reutiliza el control de generaciones); los
      inactivos no consultan. Al activar una pestaña: revalidar identidad con el flujo de
      apertura, releer ramas y etiquetas y la huella del árbol de trabajo; las acciones de
      escritura (checkout, pull, push) quedan deshabilitadas hasta terminar. El historial en
      caché se reutiliza si las referencias no cambiaron y se invalida si cambiaron. Indicadores
      de proyectos inactivos con el último estado conocido.
      *Pruebas:* solo un watcher vivo tras varios cambios rápidos; referencias iguales
      reutilizan páginas; referencias distintas las invalidan; ruta desaparecida al activar.
      → `feat(workspace): observe only the active tab and verify it on activation`

- [ ] **WS-8 — Barra de pestañas.** Componente accesible sobre la toolbar: pestañas, cierre,
      botón de apertura y menú de desbordamiento. Nombres repetidos se distinguen con la carpeta
      contenedora y el tooltip muestra la ruta completa. Textos en los catálogos en inglés y
      español, CSS con propiedades lógicas, correcta a 940 px y en ambos temas.
      *Pruebas:* render y cierre, desbordamiento, nombres repetidos, textos largos, test de
      literales y de propiedades lógicas.
      → `feat(workspace): add an accessible tab bar with overflow and disambiguation`

- [ ] **WS-9 — Reordenar y teclado.** Reordenar por arrastre y por teclado; patrón WAI-ARIA de
      pestañas (`tablist`, foco itinerante, foco visible). Atajos: abrir (⌘/Ctrl+O), cerrar
      (⌘/Ctrl+W), recorrer (Ctrl+Tab y Ctrl+Mayús+Tab) y saltar a la pestaña N (⌘/Ctrl+1–8, 9 a
      la última). No se interceptan al escribir en campos de texto.
      *Pruebas:* recorrido completo solo con teclado, atajos con foco en un campo, reorden y
      persistencia del orden en la sesión.
      → `feat(workspace): reorder tabs and drive them from the keyboard`

- [ ] **WS-10 — Guardar y restaurar la sesión.** Guardado con debounce hacia `save_workspace`
      de pestañas, orden, activa y navegación (selección, carpetas, ancla). No se persisten
      diffs, historiales ni operaciones en curso. Al iniciar se restaura de forma progresiva:
      primero la pestaña activa, el resto en segundo plano; cada ruta se revalida con el flujo
      autorizado de apertura y lo guardado nunca autoriza nada por sí solo.
      *Pruebas:* ida y vuelta con el almacén real, restauración priorizada, ruta que ya no es
      repositorio, ráfaga de cambios produce una sola escritura.
      → `feat(workspace): save and restore the session, active tab first`

- [ ] **WS-11 — Pestañas recuperables y fallos de persistencia visibles.** Ruta desaparecida o
      repositorio inaccesible: la pestaña se conserva con **Reintentar**, **Localizar** (elegir
      otra carpeta) y **Cerrar**. Un fallo de guardado o un almacén corrupto se muestra con
      `ErrorMessage` y la aplicación sigue funcionando en memoria.
      *Pruebas:* cada una de las tres acciones, almacén corrupto al arrancar, fallo de escritura.
      → `feat(workspace): keep unreachable tabs recoverable and surface storage failures`

- [ ] **WS-12 — Favoritos y recientes.** Marcar y desmarcar favoritos, lista de los 20 más
      recientes y acceso desde la pantalla vacía y un menú de la barra. Favoritos y pestañas son
      independientes: cerrar una pestaña no borra el favorito. Entradas con ruta inaccesible se
      muestran como tales y se pueden quitar.
      *Pruebas:* alta, baja, orden por uso, tope de 20, persistencia, ruta desaparecida.
      → `feat(workspace): add favorites and a recent projects list`

- [ ] **WS-13 — Liberar recursos al cerrar y acotar los inactivos.** Cerrar una pestaña quita
      su sesión, sus consultas (`removeQueries` por ruta con un helper en `queryKeys.ts`) y su
      entrada en el registro del backend. Se retienen consultas pesadas del proyecto activo y de
      **como máximo cinco** inactivos (LRU); el presupuesto global de `HistoryReader` (8
      instantáneas, 2 000 000 de ids) no cambia.
      *Pruebas:* cierre libera todo lo de esa ruta, el sexto inactivo expulsa al más antiguo,
      el activo nunca se expulsa.
      → `perf(workspace): release closed tabs and bound inactive project caches`

- [ ] **WS-14 — E2E de varias pestañas.** Dos repositorios de fixture: abrir ambos, alternar sin
      mezclar historial ni cambios locales, reabrir un repositorio ya abierto sin duplicar,
      cerrar una pestaña, favorito que sobrevive al cierre. En los cuatro specs existentes la
      pestaña única sigue funcionando sin cambios.
      → `test(e2e): cover switching, reopening and closing tabs across two repositories`

- [ ] **WS-15 — Documentación.** ADR 0006 (workspace, identidad por raíz, almacén y
      restauración), ARCHITECTURE, CONTEXT (observación y registro de repositorios abiertos),
      PRODUCT, DESIGN (barra de pestañas), README, CLAUDE.md (el estado ya no es una sesión
      única) y CHANGELOG.
      → `docs(workspace): record the tabs, favorites and persistence decisions in adr 0006`

- [ ] **WS-16 — Verificar en Linux y Windows y publicar v0.3.0.** Corrida de `quality` sobre
      `dev` (matriz de tres sistemas, cobertura, Clippy, bindings sin deriva, E2E nativos) y
      validación manual del flujo de pestañas en cada sistema. Después, `/release` (versión
      confirmada con David).
      → `docs: close the workspace series and record the v0.3.0 verification`

#### Decisiones abiertas

1. **El idioma sigue en `localStorage`.** El plan dice centralizar el idioma en el almacén de
   Rust, pero el ADR 0004 exige resolverlo **antes del primer render** y esa lectura es
   síncrona; un almacén asíncrono mostraría primero otro idioma. *Recomendación:* idioma, tema y
   tamaños de panel se quedan en `localStorage`; el almacén de Rust guarda solo workspace,
   favoritos y recientes.
2. **Los borradores de commit no entran en la 0.3.** Todavía no existe la función de commit; el
   esquema versionado de WS-2 deja espacio para añadirlos con la sección 2.
3. **Tope de pestañas abiertas.** El plan no lo fija. *Recomendación:* 30, con un aviso claro al
   superarlo, para acotar memoria y observación.
4. **Fuera de la 0.3:** la exclusión mutua de escrituras por directorio Git común (pertenece a
   los commits) y la preparación y el commit desde la interfaz.

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
