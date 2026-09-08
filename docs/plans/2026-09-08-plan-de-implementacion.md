# GitCanvas — Plan de implementación

## Contexto

`/Users/davidcardenas/Developer/Tauri/GitCanvas` hoy contiene **solo** `docs/` con cuatro archivos: [ASSET.md](docs/ASSET.md), [PLAN-DESARROLLO.md](docs/PLAN-DESARROLLO.md), [SNAPSHOT.md](docs/SNAPSHOT.md) y [mockup.html](docs/mockup.html). No hay código, no hay repositorio git, no hay remoto.

El diseño está cerrado: cliente Git visual estilo GitKraken, con el **graph de branches y commits como núcleo de valor**. Stack decidido: Tauri v2 + Rust (`git2`) + React/TypeScript, layout del graph calculado en TS y renderizado en SVG con virtualización.

Este plan hace tres cosas:

1. **Crea el repositorio** con `main` como punto de partida y `dev` como rama de trabajo, con cada commit ordenado según el skill `commit-flow`.
2. **Endurece PLAN-DESARROLLO.md** donde su intención es correcta pero su mecanismo no alcanza, o donde una dependencia que nombra quedó obsoleta (sección "Deltas").
3. **Ejecuta las seis fases** (0 a 5) hasta el MVP completo: abrir repo → graph → diff → GitHub → checkout/pull/push.

**Principio que gobierna todo el plan:** cada regla de calidad se convierte en un *fallo de build*, no en una nota de code review. Una regla que depende de que alguien se acuerde ya es deuda técnica.

---

## Prerrequisito que debe correr David

Rust no está instalado en esta máquina (`rustc`, `cargo` y `rustup` no existen en el PATH). Node v22.22.3, git 2.37.1, `gh` 2.92.0 autenticado como `dcardenasl` y Xcode CLI ya están.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source "$HOME/.cargo/env" && rustup component add clippy rustfmt && rustc --version
```

Sin esto la Fase 0 no arranca. Es el único paso del plan que no puedo ejecutar por vos (instala y ejecuta un binario descargado).

---

## Decisiones confirmadas en esta sesión

| Decisión | Elegida |
|---|---|
| Trigger de CI | Tu convención de `ci4-website-suite`: pre-commit rápido de estilo, check ligero en push a `dev`, matriz completa solo en el PR `dev → main` |
| Remoto | `gh repo create dcardenasl/gitcanvas --private`, con `main` protegida |
| Licencia | Sin `LICENSE`. README declara *All rights reserved · uso personal* |
| Alcance de ejecución | Las seis fases de corrido (reporte al cerrar cada fase, sin detenerme a pedir aprobación) |

**Sobre los mensajes de commit:** pediste explícitamente seguir `commit-flow`, que prohíbe cualquier trailer de atribución (`Co-Authored-By`, mención a Claude/AI). Eso anula la atribución por defecto de esta sesión. Los commits van a ser una sola línea, en inglés, imperativo, sin trailers.

---

## Deltas sobre PLAN-DESARROLLO.md

Diez cambios. Ninguno altera el diseño del producto; todos hacen cumplir por máquina lo que el documento pide por disciplina, o corrigen una dependencia que cambió.

| # | El documento dice | El plan hace | Por qué |
|---|---|---|---|
| **D1** | `git/` "no sabe que existe Tauri" como convención de carpetas | **Cargo workspace**: `crates/gitcanvas-core/` sin `tauri` en sus dependencias | Un `use tauri::…` dentro de core deja de compilar. La regla la aplica el grafo de dependencias, no la revisión |
| **D2** | Tokens en "Stronghold o el plugin de keychain del SO" | Crate **`keyring` v3** directo en Rust | Stronghold **está deprecado y se elimina en Tauri v3**. Además, con `keyring` en el backend el token **nunca cruza el IPC**: el frontend jamás lo ve |
| **D3** | "Cero `unwrap`/`expect`/`panic!`" | `#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]` a nivel de crate, con `cfg_attr(test, allow(…))` | El principio pasa de aspiración a error de compilación |
| **D4** | Layout recorre la lista y asigna carriles | Layout **reanudable**: `layout(commits, prevState) -> { rows, state }` | Con paginación por cursor, recalcular desde cero al cargar la página 2 **reordena los carriles de la página 1** y el graph "salta" bajo el cursor. Es un bug garantizado, no hipotético |
| **D5** | SVG "sincronizado con el scroll de la tabla" | **Un solo contenedor de scroll**: el SVG es una capa absoluta dentro del mismo contenedor virtualizado | Dos contenedores sincronizados por JS producen jitter de un frame en cada scroll. Con uno solo, el código de sincronización no existe y por lo tanto no puede fallar |
| **D6** | "Ningún tipo duplicado a mano (verificado contra `bindings.ts`)" | CI regenera `bindings.ts` y corre `git diff --exit-code` | "Verificado" tiene que ser un comando que falla, no una casilla que alguien tilda |
| **D7** | E2E con `tauri-driver` + WebDriver | **WebdriverIO + `@wdio/tauri-service`** | Apple no provee WebDriver para WKWebView: `tauri-driver` **no corre en macOS**, que es tu máquina. El servicio de WDIO levanta un servidor embebido y funciona en los tres SO |
| **D8** | Entrada obligatoria en `HISTORIAL.md` | **`CHANGELOG.md`** en formato Keep a Changelog | Es tu convención real y lo que consumen `commit-flow`, el skill `release` y `release.yml`. `docs/ASSET.md` sigue siendo el historial del *asset* |
| **D9** | Matriz de 3 SO en cada push | Matriz completa en el PR `dev → main`; en push a `dev` solo typecheck + tests unitarios en ubuntu | Tu decisión de esta sesión, y coincide con el comentario de `quality.yml` en `ci4-website-suite` |
| **D10** | `tauri-specta` sin versión | Pin exacto a `2.0.0-rc.21` | Sigue en release candidate. Un pin exacto es predecible; un rango sobre RCs no lo es |

---

## Estructura del repositorio

```
GitCanvas/
├── Cargo.toml                  → workspace: ["src-tauri", "crates/gitcanvas-core"]
├── crates/gitcanvas-core/      → dominio git puro. CERO dependencia de tauri
│   ├── src/
│   │   ├── lib.rs              → deny(unwrap_used, expect_used, panic, indexing_slicing)
│   │   ├── error.rs            → AppError (thiserror + serde + specta)
│   │   ├── repository.rs       → apertura y validación canónica de paths
│   │   ├── history.rs          → revwalk + paginación por cursor
│   │   ├── refs.rs             → branches locales/remotas y tags
│   │   ├── diff.rs             → diff contra primer padre, guards de binario/tamaño
│   │   ├── actions.rs          → checkout, pull ff-only, push
│   │   └── github/             → cliente REST, clone con progreso, caché LRU, keyring
│   └── tests/                  → integración contra repos temporales de git2
├── src-tauri/                  → capa Tauri delgada
│   ├── src/
│   │   ├── main.rs             → Builder de tauri-specta, registro, export de bindings
│   │   ├── commands/           → un archivo por dominio; solo traduce IPC ↔ core
│   │   └── state.rs            → ActiveRepo (path canónico validado), sin Repository vivo
│   └── tauri.conf.json
├── src/                        → frontend
│   ├── bindings.ts             → GENERADO. En CI se regenera y se compara
│   ├── lib/graph-layout/       → algoritmo puro. ESLint prohíbe importar de components/
│   ├── lib/ipc/                → wrappers tipados sobre bindings.ts
│   ├── components/             → GraphCanvas, CommitTable, CommitDetailPanel, DiffViewer
│   └── state/                  → React Query (server) + Zustand (UI)
├── .github/workflows/          → dev-check.yml, quality.yml, release.yml
├── pre-commit                  → hook en la raíz (tu convención)
├── scripts/install-git-hooks.sh
├── CHANGELOG.md · README.md · CLAUDE.md · ARCHITECTURE.md
└── docs/                       → los 4 archivos existentes, intactos
```

---

## Fase G — Bootstrap del repositorio

Único punto donde se commitea a `main`: el commit que la crea.

1. `git init -b main` en la raíz del proyecto.
2. Crear `.gitignore` (target/, node_modules/, dist/, .DS_Store, .env), `.editorconfig` (4 espacios Rust, 2 JS/TS, per AGENTS.md), `README.md`, `CHANGELOG.md` con `## [Unreleased]` vacío, `CLAUDE.md`, **`TASKS.md`** (ver sección dedicada) y mover este plan a `docs/plans/2026-09-08-plan-de-implementacion.md`.
3. Commit único en `main`: `chore: initialize the repository` — incluye `docs/` tal como está.
4. `gh repo create dcardenasl/gitcanvas --private --source=. --remote=origin --push`.
5. Proteger `main`: requerir PR y que `quality` pase (vía `gh api`). Sin esto, la puerta de calidad es voluntaria.
6. `git checkout -b dev && git push -u origin dev`. **Todo lo demás va acá.**

---

## Fase 0 — Cimientos

**Objetivo:** que build, lint, tipos, tests, hooks, CI y generación de bindings funcionen antes de la primera línea de lógica.

**Contenido técnico:**

- Scaffold con `npm create tauri-app@latest` (React + TS + Vite) en un directorio temporal, luego fusionado en la raíz para no pisar `docs/`.
- Reestructurar a Cargo workspace: mover el dominio a `crates/gitcanvas-core`, dejar `src-tauri` como capa delgada (**D1**).
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`.
- ESLint type-checked (`@typescript-eslint`) con `no-explicit-any: error` y `no-restricted-imports` que **prohíbe a `lib/graph-layout/**` importar de `components/`, `state/`, `bindings.ts` o cualquier API del DOM** (**D10**). Sus tests corren con `environment: 'node'`: si el algoritmo tocara `window`, el test explota.
- Lints de Rust: `clippy::all` + `clippy::pedantic`, y los `deny` de **D3** en `lib.rs`.
- `tauri-specta` `2.0.0-rc.21` + `specta` + `specta-typescript`; export de `src/bindings.ts` bajo `#[cfg(debug_assertions)]` desde el `Builder`, con `.commands(collect_commands![…])` y `.events(collect_events![…])`.
- Comando `ping` (devuelve versión de la app) con test, para validar el roundtrip IPC completo antes de depender de él.
- Hook `pre-commit` en la raíz + `scripts/install-git-hooks.sh` (copiado del patrón de `ci4-website-suite`, adaptado a Node: se dispara desde `prepare` de npm). El hook corre **solo lo instantáneo**: `cargo fmt --check` y `eslint`/`prettier`. Clippy y los tests viven en CI.
- Tres workflows (**D9**): `dev-check.yml` (push a `dev`: typecheck, lint, vitest, `cargo test -p gitcanvas-core`, en ubuntu), `quality.yml` (PR a `main`: matriz ubuntu/macos/windows con `cargo fmt --check`, `clippy --all-targets -- -D warnings`, `cargo test`, vitest con umbrales de cobertura, **drift de `bindings.ts` (D6)**, `tauri build`, y E2E en ubuntu), `release.yml` (copiado casi literal del de `ci4-website-suite`: tag `v*.*.*` → extrae la sección del CHANGELOG → crea el GitHub Release).

**Commits (en `dev`):**

```
chore(scaffold): add the tauri v2 app with react and typescript
refactor(rust): extract the git domain into the gitcanvas-core crate
chore(ts): enable strict typescript and the graph-layout import boundary
chore(rust): enable clippy pedantic and deny unwrap, expect and panic
feat(ipc): add the ping command and generate the typed bindings
test(ipc): cover the ping command roundtrip
chore(hooks): add the pre-commit style hook and its installer
ci: add the dev push check and the pull request quality matrix
ci: add the changelog-driven release workflow
docs: add the architecture note
```

**Definición de hecho:** `cargo clippy --all-targets -- -D warnings` limpio · `npm run typecheck && npm run lint` limpio · CI verde en los 3 SO · la ventana abre y `ping` hace roundtrip Rust → TS.

---

## Fase 1 — Motor de datos Git (Rust)

**Contenido técnico:**

- `AppError` como enum único (`thiserror` + `serde` + `specta::Type`), con `From<git2::Error>` que **convierte el mensaje a String** — nunca se serializa el objeto crudo.
- `git2 = { version = "0.21", features = ["vendored-libgit2", "vendored-openssl"] }`. Vendorizar libgit2 **y** OpenSSL elimina la dependencia de librerías del sistema en tu máquina, en CI y en el instalador.
- **Estado:** `state.rs` guarda un `ActiveRepo(PathBuf)` que solo se puede construir a través de la validación (canonicalizar → existe → contiene `.git`). Un path inválido es *irrepresentable*, no "validado en algún lado". Nunca se guarda un `git2::Repository` vivo; cada comando abre el suyo.
- **Todo comando que toca `git2` corre en `tauri::async_runtime::spawn_blocking`.** Sin excepción.
- Revwalk con `Sort::TOPOLOGICAL | Sort::TIME`. Página de máximo 500 commits, cursor = SHA del último commit visto.
- `tracing` con archivo rotativo en el directorio de datos de la app.

**Tests:** fixtures construidos programáticamente con la API de `git2` en directorios temporales — nunca repos `.git` versionados. Casos: lineal, un merge, branches divergentes, octopus, tags, HEAD desprendido, repo vacío, límite exacto de página.

**Commits:**

```
feat(core): add the app error type and canonical repository validation
test(core): cover repository validation with temporary fixtures
feat(core): add the cursor-paginated commit history walk
test(core): cover linear, merge, diverged and detached head histories
feat(core): resolve local branches, remote branches and tags
test(core): cover ref resolution against the fixture repositories
feat(ipc): expose the repository, history and refs commands
test(ipc): cover the command layer against a temporary repository
feat(app): add structured tracing to a rotating log file
docs(changelog): record the git data engine
```

**Definición de hecho:** la primera página de `ci4-website-suite` coincide commit por commit con `git log` · p95 < 300ms en repos de hasta 10.000 commits (medición documentada, no aserción en CI: una aserción de tiempo en un runner compartido es flaky por diseño) · cero `unwrap`/`expect`/`panic` — garantizado por **D3**.

---

## Fase 2 — Layout del graph + render (núcleo del valor)

**El algoritmo (`src/lib/graph-layout/layout.ts`, TypeScript puro):**

Firma reanudable (**D4**):

```ts
type LayoutState = {
  lanes: (CommitId | null)[];        // qué commit ocupa cada carril
  reservations: Map<CommitId, LaneIndex>;  // carriles ya prometidos a padres futuros
};
layout(commits: CommitInfo[], prev?: LayoutState): { rows: GraphRow[]; state: LayoutState }
```

Recorriendo del commit más nuevo al más viejo:

1. Si el commit tiene carril reservado por un hijo ya procesado, usa ese. Si no, toma el primer carril libre.
2. El **primer padre continúa en el mismo carril** (convención de git: el primer padre es la continuación natural de la branch).
3. Padres adicionales (merges) reservan carril propio, o reutilizan el que ya tuvieran.
4. Un carril se libera cuando su línea termina, y queda disponible para la próxima branch nueva. Así el ancho no crece sin límite.
5. **Color: función determinística del índice de carril**, ciclando sobre una paleta fija accesible. Nunca aleatorio: los colores no pueden parpadear entre renders.

Casos borde diseñados de entrada, no descubiertos en producción: octopus merge (>2 padres), commit inicial sin padres, y **el borde de página** — si un commit tiene padres que no están en la página actual, se dibuja un indicador de "continúa" en vez de asumir que la línea termina. `state` es exactamente lo que hace que la página siguiente retome sin reordenar nada.

**Render:**

- `GraphCanvas`: SVG puro. Círculos para nodos, Bézier para cambios de carril, rectas para el mismo carril.
- `@tanstack/react-virtual`: **un solo virtualizador y un solo contenedor de scroll** (**D5**). El SVG es una capa absoluta dentro del contenedor interno, dimensionada con `getTotalSize()`, y dibuja solo los tramos de la ventana visible ± overscan. Como ninguna arista cruza más de una fila sin pasar por un nodo, dibujar `visibles + 1` es exacto, no aproximado.
- Datos vía React Query `useInfiniteQuery` con el cursor de la Fase 1.

**Tests:** fixtures de grafos armados a mano; se verifica el **carril y color exactos** de cada commit, no "que no explote". Incluye un test de dos páginas que afirma que los carriles de la página 1 no cambian al cargar la 2. Umbral de cobertura en CI para `lib/graph-layout/**`: **90%**, configurado como glob en `coverage.thresholds` de vitest (el resto del proyecto tiene un piso más bajo).

**Commits:**

```
feat(graph): add the resumable lane layout algorithm
test(graph): cover linear, merge, octopus and page boundary layouts
feat(graph): add the deterministic accessible lane palette
feat(ui): add the virtualized commit table
feat(ui): render the commit graph as an svg layer over the virtual rows
feat(ui): load commit history through cursor-based infinite queries
test(ui): cover graph rendering for the fixture histories
docs(changelog): record the commit graph
```

**Definición de hecho:** el historial real de `ci4-website-suite` (con el merge de la PR #1 visible en el mockup) se dibuja sin cruces innecesarios · scroll a 60fps con 12 carriles activos · cobertura ≥90% en `graph-layout/`.

---

## Fase 3 — Detalle de commit + diff

- Diff **contra el primer padre únicamente**. El diff combinado de merges queda documentado como limitación conocida en README y CHANGELOG — no se intenta a medias.
- Render con `react-diff-view` (librería madura). Construir un visor propio es la deuda técnica silenciosa clásica: parece simple hasta que aparecen encodings raros y archivos sin newline final.
- **Guards:** binario detectado por `git2` → placeholder, nunca se intenta diffear. Diff > 2000 líneas → carga bajo demanda con botón "ver diff completo".

**Commits:**

```
feat(core): add the first-parent commit diff with binary and size guards
test(core): cover diffs for text, binary and oversized files
feat(ipc): expose the commit diff command
feat(ui): add the commit detail panel
feat(ui): add the diff viewer with on-demand loading for large diffs
docs(changelog): record the commit detail panel and diff viewer
```

**Definición de hecho:** el diff de cualquier commit coincide con `git show` · un binario o un diff gigante no bloquea la UI.

---

## Fase 4 — Integración con GitHub

- **Nunca clone shallow.** Un historial truncado contradice el valor central del producto. Clone completo a un directorio de caché bajo el app data dir, con progreso reportado al frontend por un evento Tauri tipado (`CloneProgress`, vía `collect_events!`).
- **Token en el keychain nativo del SO vía el crate `keyring` v3** (**D2**), con las features por plataforma explícitas: `apple-native`, `windows-native`, `sync-secret-service` (el crate no tiene features por defecto). El token **vive y se usa solo en Rust**: alimenta el callback de credenciales de `git2` y las llamadas REST. El frontend nunca lo recibe, ni siquiera enmascarado.
- **La API REST de GitHub se usa solo para dos cosas:** validar el token y listar repos accesibles. Toda la data del graph sale siempre del clone local vía `git2`. Un solo camino de datos, no dos.
- **Retención de caché:** límite de 10 repositorios o 5GB (lo que se cumpla primero), con expulsión LRU.

**Commits:**

```
feat(core): add the github token store backed by the os keychain
feat(core): add the github rest client for token and repository listing
test(core): cover the github client against a mocked transport
feat(core): add full repository cloning with progress reporting
feat(core): add the lru retention policy for the clone cache
test(core): cover the clone cache retention policy
feat(ipc): expose the github commands and the clone progress event
feat(ui): add the github repository picker and clone progress
docs(changelog): record the github integration
```

**Definición de hecho:** una URL pública se clona y muestra su graph completo · un repo privado se lista y clona con PAT, y **el token no aparece en ningún archivo plano de la app** (verificado con `grep -r` sobre el app data dir).

> Para probar repos privados vas a necesitar generar un PAT con scope `repo` y pegarlo en la app. No lo tomo de `gh auth token` automáticamente: es una credencial tuya y la app debe ejercitar su propio camino de almacenamiento.

---

## Fase 5 — Acciones básicas

- **Checkout seguro por defecto:** si el working tree tiene cambios que se perderían, se bloquea y se informa el conflicto. Forzar exige confirmación explícita.
- **Pull limitado a fast-forward.** Si no resuelve como ff, se informa y la decisión queda en el usuario. Crear commits de merge desde la UI amerita más cuidado del que el MVP justifica.
- **Push reutiliza las credenciales de la Fase 4.** Fallos de auth con mensaje claro, nunca error genérico.
- Toda acción destructiva pide confirmación explícita en la UI.
- **E2E** con WebdriverIO + `@wdio/tauri-service` (**D7**), cubriendo el camino crítico: abrir repo → ver graph → click en commit → ver diff. Corre en CI (ubuntu) dentro de `quality.yml`.

**Commits:**

```
feat(core): add guarded branch checkout
feat(core): add fast-forward only pull
feat(core): add push with keychain-backed credentials
test(core): cover checkout guards, fast-forward pull and push failures
feat(ipc): expose the checkout, pull and push commands
feat(ui): add toolbar actions with destructive action confirmations
test(e2e): cover the open repository to diff critical path
docs(changelog): record the checkout, pull and push actions
```

---

## Cierre — Release v0.1.0

Siguiendo el skill `release`: `chore: release v0.1.0` como último commit de `dev` (renombra `[Unreleased]` a `## [0.1.0] — YYYY-MM-DD`), PR `dev → main`, merge cuando `quality` pase, tag `v0.1.0` en `main`, y `release.yml` crea el GitHub Release con las notas extraídas del CHANGELOG.

Al final actualizo `docs/ASSET.md` y `docs/SNAPSHOT.md`: versión v0.1.0, repositorio, estado del build por componente y log de avances.

---

## El archivo `TASKS.md`

Se crea en la raíz en el commit de Fase G y es **la fuente de verdad de ejecución**: el plan explica *por qué*, `TASKS.md` dice *qué falta y dónde quedé*. Sigue la convención de `ci4-website-suite/TASKS.md`: prosa en español, tareas con ID estable, checkbox, y una explicación que dice el motivo, no solo el título.

**Regla de mantenimiento:** cada tarea se marca `[x]` **en el mismo commit que la implementa**. Nunca se marcan por lotes al final — el valor del archivo es que su estado sea cierto en cualquier commit del historial, para que una sesión nueva pueda hacer `git pull` y saber exactamente dónde está.

Cuando durante la ejecución aparece un hallazgo (algo que el plan no previó), se anota bajo la tarea con el prefijo `*Hallazgo durante la ejecución:*`, igual que en `ci4-website-suite`. Eso es lo que evita que la próxima sesión repita un error ya resuelto.

**IDs:** `G-n` bootstrap · `F0-n` … `F5-n` fases · `R-n` release. Estables para siempre: una tarea nunca se renumera, y si se cancela se marca `~~tachada~~` con el motivo.

**Esqueleto:**

```markdown
# TASKS — GitCanvas

> Fuente de verdad de ejecución. El plan rector está en
> [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones de trabajo y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).

**Estado:** Fase 0 · 0/51 tareas · última actualización 2026-09-08

## 🔴 En progreso — Fase 0: Cimientos

- [ ] **F0-1 — Scaffold Tauri v2.** `npm create tauri-app@latest` (React + TS + Vite) en un
      directorio temporal y fusionado en la raíz, para no pisar `docs/`.
      → `chore(scaffold): add the tauri v2 app with react and typescript`

- [ ] **F0-2 — Workspace Rust.** Mover el dominio git a `crates/gitcanvas-core`, sin `tauri`
      entre sus dependencias. Motivo: convierte "el dominio no sabe que existe Tauri" en un
      error de compilación en vez de una convención de carpetas (delta D1 del plan).
      → `refactor(rust): extract the git domain into the gitcanvas-core crate`

  … (una entrada por cada commit del ledger del plan)

## ⏳ Pendiente
Fase 1 · Fase 2 · Fase 3 · Fase 4 · Fase 5 · Release v0.1.0

## ✅ Completado
Fase G — Bootstrap del repositorio (6/6)
```

Las 51 tareas salen una a una de los ledgers de commits de cada fase de este plan: `G` 6, `F0` 10, `F1` 10, `F2` 8, `F3` 6, `F4` 9, `F5` 8, `R` 5 — un commit, una tarea, sin excepción.

---

## Contexto para continuar en otra sesión

Esta sección existe para que **cualquier modelo o sesión nueva** pueda retomar sin la conversación previa. Su contenido va a `CLAUDE.md` en la raíz del repo, que es lo que se carga automáticamente al abrir el proyecto.

### Cómo retomar en frío

1. Leer `TASKS.md` → primera tarea sin marcar.
2. Leer `docs/plans/2026-09-08-plan-de-implementacion.md` → la sección de esa fase, que trae las decisiones técnicas ya cerradas.
3. `git log --oneline | head -15` → confirmar el estilo real del historial antes de escribir cualquier mensaje.
4. Verificar que estás en `dev`: `git branch --show-current`.

### Skills referenciados en este plan

Son skills de Claude Code que viven en `~/.claude/skills/`. Si el modelo que retoma no tiene acceso a ellos, esto es lo que hacen, con el detalle suficiente para reproducirlos a mano:

**`/commit-flow`** — el flujo de commit completo, de cambios staged a `dev` listo para PR. Reglas que aplican **siempre**, se invoque el skill o no:

- Mensaje: `type(scope): subject`, **una sola línea, un solo `-m`, en inglés, imperativo, minúscula después de los dos puntos, sin punto final**. Tipos: `feat fix docs chore refactor test perf style ci build`.
- **Prohibido:** cuerpo del mensaje, cualquier trailer (`Co-Authored-By` incluido), toda mención a Claude/AI/Anthropic, mensajes en español, `--no-verify`, `--amend` después de que falle un hook, `git add .` o `git add -A`.
- **Nunca se commitea a `main`.** Todo va a `dev`.
- Antes de escribir el mensaje: `git log --oneline | head -15` y copiar el estilo existente.
- Se stagean **archivos nombrados uno por uno**, nunca el directorio entero.
- Si un hook falla: mostrar el error, arreglar la causa, **crear un commit nuevo** (jamás `--amend`, jamás bypass).
- **Nunca** `git reset --hard`, `git clean -fd`, `git push --force` ni `git checkout -- .` sin confirmación explícita de David.
- CHANGELOG: solo para cambios que un usuario nota (`feat`, `fix`, `perf`). Se agrega a la versión no publicada existente; **nunca se inventa un número de versión nuevo**.
- El skill **termina en el push a `dev`**. No abre PR ni mergea.

**`/release`** — el ciclo de release completo, y la **única** forma en que este proyecto llega a `main`:

1. Auditar: último tag en `main`, commits de `main..dev`, estado del CHANGELOG.
2. Decidir versión por SemVer (`feat` → minor, resto → patch; breaking pre-1.0 → minor). **Confirmar con David.**
3. Renombrar `## [Unreleased]` a `## [X.Y.Z] — YYYY-MM-DD` y abrir un `[Unreleased]` nuevo vacío arriba.
4. `chore: release vX.Y.Z` como **último commit de `dev`**, y push.
5. `gh pr create --base main --head dev`. **Parar y esperar aprobación de David.**
6. `gh pr merge <N> --merge` — **nunca** `--squash` ni `--rebase`.
7. Tag `vX.Y.Z` **solo sobre `main`**, y push del tag. `release.yml` crea el GitHub Release extrayendo la sección del CHANGELOG.
8. **Nunca** `gh release create` a mano: el workflow es quien lo hace. Si falta la sección `## [X.Y.Z]` en el CHANGELOG, el workflow falla — no taggear sin ella.
9. `dev` es permanente: no se borra después del merge.

**`/auditoria-procesos`** — bitácora del proceso de ejecución (qué funcionó, qué falló, qué se corrigió), con informe en `audits/`. **Solo si David lo pide explícitamente para la tarea en curso.** No se activa solo.

**`/code-review` y `/security-review`** — puertas opcionales de revisión del diff actual. Útiles antes de abrir el PR de release; no forman parte del flujo obligatorio.

### Convenciones que no están en ningún skill

- **Idioma:** la conversación con David es en español. **El código, los comentarios, los mensajes de commit, el CHANGELOG y los docs técnicos del repo van en inglés.** `TASKS.md` y `docs/` son la excepción: español, porque son suyos.
- **Indentación** (de `Developer/AGENTS.md`): 4 espacios en Rust, 2 en JS/TS. `PascalCase` clases y componentes, `camelCase` variables y funciones, `kebab-case` nombres de archivo web.
- **`dev` es rápido, el PR a `main` es la puerta.** No agregues checks pesados al hook de pre-commit ni al workflow de push: esa decisión ya está tomada y explicada en `quality.yml`.
- **Nunca editar `src/bindings.ts` a mano.** Es generado por `tauri-specta`; CI lo regenera y falla si difiere.
- **Repos de referencia en esta máquina** (leer, nunca modificar): `~/Developer/PHP/ci4-website-starter/ci4-website-suite` es el modelo de `release.yml`, del instalador de hooks, del formato del CHANGELOG y del estilo de `TASKS.md`. `~/Developer/PHP/ci4-platform/ci4-admin-starter` es el otro repo que GitCanvas tiene que saber abrir.

### Estado del entorno al escribir este plan

Node v22.22.3 · npm 11.1.2 · git 2.37.1 · `gh` 2.92.0 autenticado como `dcardenasl` (scopes `repo`, `workflow`, `read:org`, `gist`) · Xcode CLI en `/Applications/Xcode.app` · **Rust NO instalado** (ver Prerrequisito). macOS (darwin 25.3.0), shell zsh.

---

## Verificación

**Por commit (automático, local):** el hook `pre-commit` corre `cargo fmt --check` + `eslint` + `prettier --check`. Instantáneo, así que `dev` sigue siendo rápido.

**Por push a `dev` (CI ligero):** typecheck, lint, `vitest run`, `cargo test -p gitcanvas-core` en ubuntu.

**En el PR `dev → main` (la puerta real):** matriz ubuntu/macos/windows con `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `vitest run --coverage` contra los umbrales (90% en `graph-layout`), **regeneración de `bindings.ts` + `git diff --exit-code`**, `tauri build`, y E2E en ubuntu.

**Manual, al cerrar cada fase:**

| Fase | Comprobación |
|---|---|
| 0 | `npm run tauri dev` abre la ventana; `ping` responde la versión en la consola del frontend |
| 1 | `get_commits` sobre `/Users/davidcardenas/Developer/PHP/ci4-website-starter/ci4-website-suite` comparado línea por línea con `git log --oneline -50` de ese mismo repo |
| 2 | El graph de `ci4-website-suite` muestra el merge de la PR #1 y `dev` bifurcándose, como en el mockup. Scroll con DevTools → Performance abierto, confirmando 60fps |
| 3 | Click en `a424020` (`docs(changelog): record the referrer-policy…`) y comparación del diff con `git show a424020` |
| 4 | Clonar un repo público por URL; luego uno privado con PAT, y `grep -ri "ghp_\|gho_" "$HOME/Library/Application Support/gitcanvas"` sin resultados |
| 5 | Checkout con working tree limpio y con cambios pendientes (debe bloquear); pull ff y pull que requiere merge (debe informar sin resolver) |

Al cerrar cada fase te reporto: commits en `dev`, estado de CI, y qué quedó verificado a mano.

---

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| `tauri-specta` sigue en RC y podría tener breaking changes | Pin exacto a `2.0.0-rc.21`. Si el pipeline de generación fallara, el plan B es `ts-rs`; el contrato (tipos definidos en Rust, generados a TS) no cambia, solo el generador |
| El layout no se ve prolijo con muchas ramas paralelas | **Aceptado explícitamente** (decisión ya tomada en tu sesión de diseño): se optimiza el caso común, no el patológico |
| Compilación nativa de libgit2 por SO | `vendored-libgit2` + `vendored-openssl`: sin dependencias del sistema en ninguna de las tres plataformas |
| Diffs binarios o gigantes cuelgan el render | Guards explícitos en Fase 3 |
| Fuga del token de GitHub | Keychain del SO vía `keyring`, y el token nunca cruza el IPC |
| Caché de clones creciendo sin control | Política LRU: 10 repos o 5GB |
| Historial completo de un repo enorme cargado de una vez | Paginación por cursor desde la Fase 1, y layout reanudable desde la Fase 2 |
| E2E en macOS | `@wdio/tauri-service` con servidor embebido; además la puerta E2E de CI corre en ubuntu |

---

## Archivos clave

**A crear en la raíz (Fase G):** `TASKS.md` (fuente de verdad de ejecución) · `CLAUDE.md` (contenido de la sección "Contexto para continuar en otra sesión") · `CHANGELOG.md` · `README.md` · `.gitignore` · `.editorconfig` · `docs/plans/2026-09-08-plan-de-implementacion.md`

**A crear en las fases:** `Cargo.toml` (workspace) · `crates/gitcanvas-core/src/{lib,error,repository,history,refs,diff,actions}.rs` · `src-tauri/src/{main,state}.rs` y `src-tauri/src/commands/` · `src/lib/graph-layout/{layout,colors,types}.ts` · `src/components/{GraphCanvas,CommitTable,CommitDetailPanel,DiffViewer}/` · `.github/workflows/{dev-check,quality,release}.yml` · `pre-commit` + `scripts/install-git-hooks.sh` · `ARCHITECTURE.md`

**A reutilizar como referencia (no modificar):** `PHP/ci4-website-starter/ci4-website-suite/.github/workflows/release.yml` (el `release.yml` de GitCanvas es una adaptación casi literal) · `.../scripts/install-git-hooks.sh` (patrón del instalador de hooks) · `.../pre-commit` (filosofía: solo estilo, instantáneo) · `.../CHANGELOG.md` (formato exacto de los bullets) · `docs/mockup.html` (referencia visual de la UI) · `Developer/AGENTS.md` (2 espacios JS/TS, 4 Rust; Conventional Commits)

**A actualizar al cierre:** `docs/ASSET.md` y `docs/SNAPSHOT.md`.