# TASKS — GitCanvas

> Fuente de verdad de ejecución. El plan rector está en
> [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones de trabajo y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).

**Estado:** Fase G · 3/63 tareas · última actualización 2026-09-08

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

## 🔴 En progreso — Fase G: Bootstrap del repositorio

- [x] **G-1 — Inicializar el repositorio.** `git init -b main`. `main` es el punto de
      partida del proyecto y el único commit propio que va a recibir es el inicial.

- [x] **G-2 — Archivos raíz.** `.gitignore`, `.editorconfig` (4 espacios Rust / 2 JS-TS,
      per `~/Developer/AGENTS.md`), `README.md` con las limitaciones conocidas escritas
      de entrada, `CHANGELOG.md` con `[Unreleased]` vacío, `CLAUDE.md` y este archivo.
      Sin `LICENSE`: el asset es privado, y publicar sin licencia es exactamente lo que
      significa "todos los derechos reservados".

- [ ] **G-3 — Commit inicial en `main`.** Incluye `docs/` intacto y el plan rector en
      `docs/plans/`.
      → `chore: initialize the repository`

- [ ] **G-4 — Remoto privado en GitHub.** `gh repo create dcardenasl/gitcanvas --private`,
      push de `main`.

- [x] **G-5 — Guard contra push a `main`.** Hook `pre-push` en la raíz +
      `scripts/install-git-hooks.sh` (sync, no solo copia: un hook borrado del repo se
      borra de `.git/hooks`). Rechaza cualquier push a `refs/heads/main`, con escape
      hatch explícito `ALLOW_MAIN_PUSH=1`. No estorba al release: `gh pr merge` mergea
      del lado del servidor y el tag va a `refs/tags/*`.
      *Hallazgo durante la ejecución:* la tarea original era proteger `main` en GitHub,
      pero **tanto la protección clásica de ramas como los rulesets devuelven 403 en un
      repo privado del plan gratuito** ("Upgrade to GitHub Pro or make this repository
      public"). Queda como decisión de David: GitHub Pro, o repo público. Mientras tanto
      la regla se hace cumplir localmente, que es lo único que sí está garantizado hoy.
      El instalador de hooks se adelantó desde F0-7 a esta tarea porque el guard lo
      necesitaba; F0-7 queda reducido a agregar el hook de estilo `pre-commit`.
      → `chore(hooks): add the pre-push guard against pushing to main`

- [ ] **G-6 — Rama `dev` y cierre del bootstrap.** `git checkout -b dev`, push con
      upstream, y marcar G-3 a G-5 como hechas. Todo el trabajo posterior va a `dev`.
      → `docs(tasks): close the repository bootstrap tasks`

---

## ⏳ Fase 0 — Cimientos

> Que build, lint, tipos, tests, hooks, CI y generación de bindings funcionen **antes**
> de la primera línea de lógica de negocio.
>
> **Prerrequisito:** Rust no está instalado en esta máquina. Lo corre David:
> `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source "$HOME/.cargo/env" && rustup component add clippy rustfmt`

- [ ] **F0-1 — Scaffold Tauri v2.** `npm create tauri-app@latest` (React + TS + Vite) en
      un directorio temporal y fusionado en la raíz, para no pisar `docs/`.
      → `chore(scaffold): add the tauri v2 app with react and typescript`

- [ ] **F0-2 — Workspace Rust.** Mover el dominio git a `crates/gitcanvas-core`, sin
      `tauri` entre sus dependencias, y dejar `src-tauri` como capa delgada. Motivo:
      convierte "el dominio no sabe que existe Tauri" de convención de carpetas en error
      de compilación (delta D1).
      → `refactor(rust): extract the git domain into the gitcanvas-core crate`

- [ ] **F0-3 — TypeScript estricto y frontera de imports.** `strict`,
      `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
      `verbatimModuleSyntax`; ESLint type-checked con `no-explicit-any: error` y
      `no-restricted-imports` prohibiendo que `lib/graph-layout/**` importe de
      `components/`, `state/`, `bindings.ts` o del DOM (delta D10). Activar strict
      después de tener código escrito cuesta mucho más que empezar con él.
      → `chore(ts): enable strict typescript and the graph-layout import boundary`

- [ ] **F0-4 — Lints de Rust.** `clippy::all` + `clippy::pedantic`, y
      `deny(clippy::unwrap_used, expect_used, panic, indexing_slicing)` a nivel de crate
      con `allow` en tests (delta D3). El principio "cero panics" pasa de aspiración a
      error de compilación.
      → `chore(rust): enable clippy pedantic and deny unwrap, expect and panic`

- [ ] **F0-5 — Comando `ping` y bindings tipados.** `tauri-specta` pineado a
      `2.0.0-rc.21` (delta D10), export de `src/bindings.ts` bajo
      `#[cfg(debug_assertions)]`. Valida el pipeline de generación de tipos de punta a
      punta **antes** de que todo lo demás dependa de él.
      → `feat(ipc): add the ping command and generate the typed bindings`

- [ ] **F0-6 — Test del roundtrip IPC.**
      → `test(ipc): cover the ping command roundtrip`

- [ ] **F0-7 — Hook de pre-commit.** Agregar el hook `pre-commit` al instalador que ya
      existe desde G-5, y engancharlo al `prepare` de npm. Corre **solo lo instantáneo**:
      `cargo fmt --check`, `eslint`, `prettier --check`. Clippy y los tests viven en CI,
      porque `dev` tiene que seguir siendo rápido.
      → `chore(hooks): add the pre-commit style hook`

- [ ] **F0-8 — Workflows de CI.** `dev-check.yml` (push a `dev`: typecheck, lint, vitest,
      `cargo test -p gitcanvas-core`, solo ubuntu) y `quality.yml` (PR a `main`: matriz
      ubuntu/macos/windows con fmt, clippy `-D warnings`, tests, cobertura contra
      umbrales, **drift de `bindings.ts`** y `tauri build`) (deltas D6 y D9).
      → `ci: add the dev push check and the pull request quality matrix`

- [ ] **F0-9 — Workflow de release.** Adaptación del `release.yml` de `ci4-website-suite`:
      tag `v*.*.*` → extrae la sección del CHANGELOG → crea el GitHub Release.
      → `ci: add the changelog-driven release workflow`

- [ ] **F0-10 — Nota de arquitectura.** `ARCHITECTURE.md` con la frontera core/tauri/ui y
      por qué está donde está.
      → `docs: add the architecture note`

**Hecho cuando:** `cargo clippy --all-targets -- -D warnings` limpio · `npm run typecheck`
y `npm run lint` limpios · CI verde en los 3 SO · la ventana abre y `ping` hace roundtrip
Rust → TypeScript.

---

## ⏳ Fase 1 — Motor de datos Git (Rust)

> Dado un path local, obtener commits, branches y tags de forma correcta y predecible,
> sin bloquear la UI, sin importar el tamaño del repositorio.

- [ ] **F1-1 — `AppError` y validación de repositorio.** Enum único con `thiserror` +
      `serde` + `specta::Type`, y `From<git2::Error>` que convierte el mensaje a String
      (nunca serializa el objeto crudo). `ActiveRepo` solo se construye a través de la
      validación —canonicalizar, existe, contiene `.git`—, así que un path inválido es
      irrepresentable en vez de "validado en algún lado".
      → `feat(core): add the app error type and canonical repository validation`

- [ ] **F1-2 — Tests de validación.** Fixtures en directorios temporales creados con la
      API de `git2`, nunca repos `.git` versionados en el proyecto.
      → `test(core): cover repository validation with temporary fixtures`

- [ ] **F1-3 — Historial paginado por cursor.** Revwalk con
      `Sort::TOPOLOGICAL | Sort::TIME`, máximo 500 commits por página, cursor = SHA del
      último commit visto. Por cursor y no por offset: un offset produce bugs
      intermitentes si el historial cambia entre llamadas.
      → `feat(core): add the cursor-paginated commit history walk`

- [ ] **F1-4 — Tests de historial.** Lineal, un merge, branches divergentes, octopus,
      HEAD desprendido, repo vacío y el límite exacto de página.
      → `test(core): cover linear, merge, diverged and detached head histories`

- [ ] **F1-5 — Resolución de refs.** Branches locales, remotas y tags, con `is_head`.
      → `feat(core): resolve local branches, remote branches and tags`

- [ ] **F1-6 — Tests de refs.**
      → `test(core): cover ref resolution against the fixture repositories`

- [ ] **F1-7 — Comandos IPC.** `open_repository`, `validate_repository`, `get_commits`,
      `get_branches`, `get_tags`. **Todos dentro de `spawn_blocking`**: `git2` es
      bloqueante y sin eso un repo grande congela la UI entera.
      → `feat(ipc): expose the repository, history and refs commands`

- [ ] **F1-8 — Tests de la capa de comandos.**
      → `test(ipc): cover the command layer against a temporary repository`

- [ ] **F1-9 — Logging estructurado.** `tracing` a archivo rotativo en el directorio de
      datos de la app, para diagnosticar sin reproducir el bug en vivo.
      → `feat(app): add structured tracing to a rotating log file`

- [ ] **F1-10 — CHANGELOG del motor de datos.**
      → `docs(changelog): record the git data engine`

**Hecho cuando:** la primera página de `ci4-website-suite` coincide commit por commit con
`git log` · p95 < 300ms en repos de hasta 10.000 commits (medido a mano y documentado; una
aserción de tiempo en un runner compartido es flaky por diseño) · cero `unwrap`/`expect`/
`panic`, garantizado por F0-4.

---

## ⏳ Fase 2 — Layout del graph y render

> El núcleo de valor del proyecto. Es la pieza que más cuidado necesita y la más difícil
> de verificar solo mirando la pantalla.

- [ ] **F2-1 — Algoritmo de carriles reanudable.**
      `layout(commits, prev?) -> { rows, state }`, TypeScript puro, sin React ni DOM.
      Reanudable (delta D4) porque recalcular desde cero al cargar la página 2 reordena
      los carriles de la página 1 y el graph "salta" bajo el cursor: es un bug
      garantizado, no hipotético. Casos borde diseñados de entrada: octopus merge, commit
      inicial sin padres, y padres fuera de la página actual (indicador "continúa").
      → `feat(graph): add the resumable lane layout algorithm`

- [ ] **F2-2 — Tests del layout.** Carril y color **exactos** por commit, no "que no
      explote". Incluye el test de dos páginas que afirma que los carriles de la primera
      no cambian al cargar la segunda.
      → `test(graph): cover linear, merge, octopus and page boundary layouts`

- [ ] **F2-3 — Paleta determinística.** Color como función del índice de carril, ciclando
      sobre una paleta fija accesible. Nunca aleatorio: los colores no pueden parpadear
      entre renders o se rompe la sensación de predictibilidad del graph.
      → `feat(graph): add the deterministic accessible lane palette`

- [ ] **F2-4 — Tabla de commits virtualizada.** `@tanstack/react-virtual`.
      → `feat(ui): add the virtualized commit table`

- [ ] **F2-5 — Render SVG del graph.** Capa absoluta dentro del **mismo** contenedor de
      scroll virtualizado (delta D5): dos contenedores sincronizados por JS producen
      jitter de un frame en cada scroll; con uno solo el código de sincronización no
      existe y por lo tanto no puede fallar. Bézier en cambios de carril, rectas en el
      mismo carril.
      → `feat(ui): render the commit graph as an svg layer over the virtual rows`

- [ ] **F2-6 — Paginación infinita.** React Query `useInfiniteQuery` sobre el cursor de
      F1-3, alimentando el estado reanudable de F2-1.
      → `feat(ui): load commit history through cursor-based infinite queries`

- [ ] **F2-7 — Tests de render.**
      → `test(ui): cover graph rendering for the fixture histories`

- [ ] **F2-8 — CHANGELOG del graph.**
      → `docs(changelog): record the commit graph`

**Hecho cuando:** el historial real de `ci4-website-suite` se dibuja con el merge de la
PR #1 y `dev` bifurcándose, como en `docs/mockup.html`, sin cruces innecesarios · scroll a
60fps con 12 carriles activos · cobertura ≥90% en `lib/graph-layout/`.

---

## ⏳ Fase 3 — Detalle de commit y diff

- [ ] **F3-1 — Diff contra el primer padre.** Con guards: binario detectado por `git2` →
      placeholder (nunca se intenta diffear), y diffs de más de 2000 líneas marcados para
      carga bajo demanda. El diff combinado de merges queda **documentado como limitación
      conocida**, no intentado a medias.
      → `feat(core): add the first-parent commit diff with binary and size guards`

- [ ] **F3-2 — Tests de diff.** Texto, binario, archivo sin newline final, y diff enorme.
      → `test(core): cover diffs for text, binary and oversized files`

- [ ] **F3-3 — Comando IPC de diff.**
      → `feat(ipc): expose the commit diff command`

- [ ] **F3-4 — Panel de detalle.** Metadata del commit, autor, refs, archivos modificados.
      → `feat(ui): add the commit detail panel`

- [ ] **F3-5 — Visor de diff.** `react-diff-view`, librería madura. Construir un visor
      propio es la deuda técnica silenciosa clásica: parece simple hasta que aparecen
      encodings raros y archivos sin salto de línea final.
      → `feat(ui): add the diff viewer with on-demand loading for large diffs`

- [ ] **F3-6 — CHANGELOG del panel de detalle.**
      → `docs(changelog): record the commit detail panel and diff viewer`

**Hecho cuando:** el diff de cualquier commit coincide con `git show` · un binario o un
diff gigante no bloquea ni ralentiza perceptiblemente la UI.

---

## ⏳ Fase 4 — Integración con GitHub

- [ ] **F4-1 — Token en el keychain del SO.** Crate `keyring` v3 con las features por
      plataforma explícitas (`apple-native`, `windows-native`, `sync-secret-service`; el
      crate no tiene features por defecto). Delta D2: Stronghold está deprecado y se
      elimina en Tauri v3. El token **vive y se usa solo en Rust** — nunca cruza el IPC,
      ni siquiera enmascarado.
      → `feat(core): add the github token store backed by the os keychain`

- [ ] **F4-2 — Cliente REST de GitHub.** Se usa **solo** para dos cosas: validar el token
      y listar repos accesibles. Toda la data del graph sale siempre del clone local vía
      `git2`. Un solo camino de datos, no dos.
      → `feat(core): add the github rest client for token and repository listing`

- [ ] **F4-3 — Tests del cliente.** Contra un transporte simulado, sin red real.
      → `test(core): cover the github client against a mocked transport`

- [ ] **F4-4 — Clone completo con progreso.** **Nunca shallow**: un historial truncado
      contradice el valor central del producto. A un directorio de caché bajo el app data
      dir, con evento Tauri tipado `CloneProgress` para que la espera sea visible.
      → `feat(core): add full repository cloning with progress reporting`

- [ ] **F4-5 — Retención LRU de la caché.** 10 repositorios o 5GB, lo que se cumpla
      primero, con expulsión del menos usado recientemente.
      → `feat(core): add the lru retention policy for the clone cache`

- [ ] **F4-6 — Tests de retención.**
      → `test(core): cover the clone cache retention policy`

- [ ] **F4-7 — Comandos y evento IPC.**
      → `feat(ipc): expose the github commands and the clone progress event`

- [ ] **F4-8 — Selector de repos y progreso en la UI.**
      → `feat(ui): add the github repository picker and clone progress`

- [ ] **F4-9 — CHANGELOG de GitHub.**
      → `docs(changelog): record the github integration`

**Hecho cuando:** una URL pública se clona y muestra su graph completo · un repo privado se
lista y clona con PAT · `grep -ri "ghp_\|gho_" "$HOME/Library/Application Support/gitcanvas"`
no devuelve nada.

> David necesita generar un PAT con scope `repo` y pegarlo en la app para probar repos
> privados. No se toma de `gh auth token`: es su credencial y la app tiene que ejercitar
> su propio camino de almacenamiento.

---

## ⏳ Fase 5 — Acciones básicas

- [ ] **F5-1 — Checkout con guard.** Si el working tree tiene cambios que se perderían, se
      bloquea y se informa el conflicto. Forzar exige confirmación explícita, nunca
      silenciosa.
      → `feat(core): add guarded branch checkout`

- [ ] **F5-2 — Pull solo fast-forward.** Si no resuelve como ff, se informa y la decisión
      queda en el usuario. Crear commits de merge desde la UI tiene implicancias de UX y
      corrección que ameritan más cuidado del que el MVP justifica.
      → `feat(core): add fast-forward only pull`

- [ ] **F5-3 — Push con credenciales del keychain.** Reutiliza F4-1. Fallos de auth con
      mensaje claro, nunca un error genérico.
      → `feat(core): add push with keychain-backed credentials`

- [ ] **F5-4 — Tests de acciones.**
      → `test(core): cover checkout guards, fast-forward pull and push failures`

- [ ] **F5-5 — Comandos IPC de acciones.**
      → `feat(ipc): expose the checkout, pull and push commands`

- [ ] **F5-6 — Toolbar con confirmaciones.** Toda acción destructiva pide confirmación
      explícita en la UI, sin excepción.
      → `feat(ui): add toolbar actions with destructive action confirmations`

- [ ] **F5-7 — E2E del camino crítico.** WebdriverIO + `@wdio/tauri-service` (delta D7:
      Apple no provee WebDriver para WKWebView, así que `tauri-driver` no corre en macOS).
      Abrir repo → ver graph → click en commit → ver diff.
      → `test(e2e): cover the open repository to diff critical path`

- [ ] **F5-8 — CHANGELOG de acciones.**
      → `docs(changelog): record the checkout, pull and push actions`

**Hecho cuando:** checkout con working tree limpio funciona y con cambios pendientes se
bloquea con mensaje claro · pull ff funciona y un caso que requiere merge se informa sin
intentar resolverlo.

---

## ⏳ Release v0.1.0

> Ejecutado con el skill `/release`. Ver `CLAUDE.md` para el procedimiento completo.

- [ ] **R-1 — Auditar y decidir versión.** Último tag en `main`, `git log main..dev`,
      estado del CHANGELOG. Confirmar `v0.1.0` con David.

- [ ] **R-2 — CHANGELOG a `0.1.0`.** Renombrar `[Unreleased]` a `## [0.1.0] — YYYY-MM-DD`
      y abrir un `[Unreleased]` vacío arriba.

- [ ] **R-3 — Commit de release.** Último commit de `dev` antes del PR.
      → `chore: release v0.1.0`

- [ ] **R-4 — PR `dev → main`.** Abrir, esperar `quality` verde, **esperar aprobación de
      David**, y mergear con `--merge` (nunca squash ni rebase).

- [ ] **R-5 — Tag y GitHub Release.** `v0.1.0` solo sobre `main`; `release.yml` crea el
      Release extrayendo la sección del CHANGELOG. Nunca `gh release create` a mano.

- [ ] **R-6 — Actualizar la ficha del asset.** `docs/ASSET.md` y `docs/SNAPSHOT.md`:
      versión, repositorio, estado del build por componente y log de avances.
      → `docs(asset): record the v0.1.0 release in the asset sheet`

---

## ✅ Completado

*(vacío — se llena al cerrar cada fase)*
