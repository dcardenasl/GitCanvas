# TASKS — GitCanvas

> Fuente de verdad de ejecución. El plan rector está en
> [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones de trabajo y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).

**Estado:** Fase 1 · 16/63 tareas · última actualización 2026-09-08

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

## ✅ Fase G — Bootstrap del repositorio (6/6)

- [x] **G-1 — Inicializar el repositorio.** `git init -b main`. `main` es el punto de
      partida del proyecto y el único commit propio que va a recibir es el inicial.

- [x] **G-2 — Archivos raíz.** `.gitignore`, `.editorconfig` (4 espacios Rust / 2 JS-TS,
      per `~/Developer/AGENTS.md`), `README.md` con las limitaciones conocidas escritas
      de entrada, `CHANGELOG.md` con `[Unreleased]` vacío, `CLAUDE.md` y este archivo.
      Sin `LICENSE`: el asset es privado, y publicar sin licencia es exactamente lo que
      significa "todos los derechos reservados".

- [x] **G-3 — Commit inicial en `main`.** Incluye `docs/` intacto y el plan rector en
      `docs/plans/`. 11 archivos; `.DS_Store` excluido por `.gitignore`.
      → `chore: initialize the repository` (`6c8b765`)

- [x] **G-4 — Remoto privado en GitHub.** https://github.com/dcardenasl/gitcanvas —
      privado, con `main` publicada.

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

- [x] **G-6 — Rama `dev` y cierre del bootstrap.** `dev` creada desde `main` y publicada
      con upstream. Todo el trabajo posterior va a `dev`.
      → `docs(tasks): close the repository bootstrap tasks`

---

## ✅ Fase 0 — Cimientos (10/10)

> Que build, lint, tipos, tests, hooks, CI y generación de bindings funcionen **antes**
> de la primera línea de lógica de negocio.
>
> **Prerrequisito:** Rust no está instalado en esta máquina. Lo corre David:
> `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source "$HOME/.cargo/env" && rustup component add clippy rustfmt`

- [x] **F0-1 — Scaffold Tauri v2.** `npm create tauri-app@latest` (React 19 + TS 6 +
      Vite 8) en un directorio temporal y fusionado en la raíz, para no pisar `docs/`.
      Del scaffold se retiró todo el demo antes del primer commit —comando `greet`,
      plugin `opener` y su permiso, logos, y el `@ts-expect-error` de `vite.config.ts`
      (reemplazado por `@types/node`, que es la dependencia que faltaba de verdad)— para
      que el árbol no arranque con código muerto. Identidad puesta: `productName`
      `GitCanvas`, ventana 1280×800 con mínimos, y arranque que reporta el error y sale
      en vez de `expect()`.
      *Hallazgo durante la ejecución:* `npm` está aliaseado a `pnpm` en el zsh de David,
      así que el primer install generó `pnpm-lock.yaml`. Los 10 proyectos JS del
      workspace usan `package-lock.json` y el CI de `ci4-website-suite` cachea npm, así
      que el alias es accidental. Resuelto declarando `"packageManager": "npm@10.9.8"` en
      `package.json`: el gestor queda fijado en el repo y deja de depender de cómo esté
      configurado el shell de quien buildea.
      *Segundo hallazgo:* el install falló con `ENOSPC` — el disco estaba al 100% (127 MB
      libres de 460 GB). Resuelto por David liberando caché.
      → `chore(scaffold): add the tauri v2 app with react and typescript`

- [x] **F0-2 — Workspace Rust.** `crates/gitcanvas-core` sin `tauri` entre sus
      dependencias; `src-tauri` pasa a depender de él y queda como capa de IPC. Versiones
      y perfiles centralizados en `[workspace.package]` y `[workspace.dependencies]`, así
      que no hay dos sitios donde una versión pueda divergir.
      *Verificado:* se agregó temporalmente `tauri::Wry` dentro del crate core y el
      compilador lo rechazó — `use of unresolved module or unlinked crate 'tauri'`. La
      frontera del delta D1 la aplica el grafo de dependencias, no la revisión. Build
      completo del workspace limpio en 43 s (Tauri 2.11.5, Rust 1.98.1).
      → `refactor(rust): extract the git domain into the gitcanvas-core crate`

- [x] **F0-3 — TypeScript estricto y frontera de imports.** `strict`,
      `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
      `noImplicitReturns`, `verbatimModuleSyntax`. ESLint plano con
      `strictTypeChecked` + `stylisticTypeChecked`, `no-explicit-any: error`, y las
      reglas de frontera de `lib/graph-layout/**` (delta D10). Prettier con
      `eslint-config-prettier` al final para que no compitan.
      *Endurecido respecto del plan:* la regla original listaba `components/`, `state/`
      y `bindings.ts`, pero eso deja pasar cualquier archivo nuevo en la raíz de `src/`
      —`../../App` entraba sin problema—. Se reemplazó por el invariante real:
      graph-layout no importa **nada fuera de su propio directorio** (`..`, `../*`,
      `../**`), más el bloqueo explícito de React, `@tauri-apps/*` y los globales del
      DOM. Verificado con una sonda de 4 importaciones prohibidas: las 4 fallan.
      *Hallazgo durante la ejecución:* Prettier reformateó `docs/` y todos los `.md` en
      la primera pasada, incluido `mockup.html` (611 líneas alteradas). Revertido y
      añadido a `.prettierignore`: son prosa y un artefacto de referencia, no código.
      → `chore(ts): enable strict typescript and the graph-layout import boundary`

- [x] **F0-4 — Lints de Rust.** `clippy::all` + `clippy::pedantic` como warning y
      `unwrap_used`, `expect_used`, `panic`, `indexing_slicing` como **deny**, definidos
      una sola vez en `[workspace.lints]` y heredados con `[lints] workspace = true`.
      Más `unsafe_code = "forbid"`. Los tests se eximen con `cfg_attr(test, allow(...))`
      en la raíz del crate: ahí un assert que revienta *es* el punto.
      *Verificado uno por uno:* sonda de `unwrap()`, `expect()`, `panic!()` e indexación
      cruda — los cuatro lints disparan. El delta D3 deja de ser una aspiración.
      *Hallazgos durante la ejecución:* (1) pedantic exigía backticks alrededor de
      "GitCanvas" en los doc comments; resuelto con `doc-valid-idents` en `clippy.toml`,
      que le enseña el vocabulario del proyecto una vez en lugar de deformar cada
      comentario. (2) Dos errores reales de pedantic en el código del scaffold —
      `build.rs` y `main.rs` sin punto y coma final. Corregidos, no silenciados.
      → `chore(rust): enable clippy pedantic and deny unwrap, expect and panic`

- [x] **F0-5 — Comando `ping` y bindings tipados.** `tauri-specta`, `specta` y
      `specta-typescript` pineados a versión exacta (delta D10). `ping` devuelve un
      struct `AppInfo`, no un string, para ejercitar la generación de structs que es la
      forma que van a tener todos los payloads reales. Frontend conectado a través de
      `src/lib/ipc/`, no importando `bindings.ts` directo: cuando cambie una firma se
      rompe un archivo, no todos los llamadores.
      *Desvío del plan:* el plan fijaba `2.0.0-rc.21`; la versión publicada actual es
      **rc.25**. Se usa la actual, igual pineada con `=`.
      *Endurecido respecto del plan:* el plan exportaba los bindings solo bajo
      `cfg(debug_assertions)` al **ejecutar** la app, lo que exige una ventana y por lo
      tanto no sirve en CI. Se agregó un test que llama al mismo `specta_builder()` y
      exporta: `cargo test` regenera el contrato de forma headless, y el chequeo de
      drift del delta D6 se vuelve un `git diff --exit-code`. Ambos caminos usan el
      mismo builder, así que no pueden divergir.
      *Hallazgos durante la ejecución:* (1) `collect_commands!` no resuelve si el
      comando se re-exporta con un `pub use` puntual — genera items ocultos junto a la
      función, así que el módulo se deja público y se referencia por ruta completa.
      (2) `tauri_specta::Builder` necesita su parámetro de runtime explícito.
      (3) El `unwrap()` del test de bindings fue rechazado por el lint de F0-4, que era
      exactamente su trabajo; resuelto con la misma exención de tests que usa core.
      *Verificado:* `tauri dev` levanta la ventana y la app arranca sin errores.
      → `feat(ipc): add the ping command and generate the typed bindings`

- [x] **F0-6 — Test del roundtrip IPC.** Test headless con `tauri::test`: construye una
      app real, despacha un `InvokeRequest` de verdad y verifica que la respuesta
      deserializa como `AppInfo` con los valores correctos. Registrar un comando y
      olvidarse de exponerlo compila perfecto y falla solo en runtime; esto lo atrapa.
      *Endurecido respecto del plan:* usa `app_context()` —el contexto real, con el
      archivo de capabilities— en vez de `mock_context(noop_assets())`, así que un
      comando que la ACL denegaría en la app publicada tampoco pasa acá.
      *Hallazgos durante la ejecución:* (1) `generate_context!` solo puede expandirse una
      vez por crate (duplica el símbolo `_EMBED_INFO_PLIST`); extraído a `app_context()`,
      que comparten la app y el test. (2) `specta_builder()` se hizo genérico sobre el
      runtime para que el test ejercite el mismo registro que la app, no una copia.
      (3) El request fallaba con `ping not allowed. Plugin not found` usando
      `http://tauri.localhost`, que es el esquema de Windows y Linux; en macOS el webview
      sirve desde `tauri://localhost` y la ACL rechaza el otro como origen desconocido.
      → `test(ipc): cover the ping command roundtrip`

- [x] **F0-7 — Hook de pre-commit.** `cargo fmt --check`, `eslint` y `prettier --check`,
      enganchado al `prepare` de npm para que se instale solo con `npm install`. Cada
      fallo imprime el comando exacto que lo arregla, en vez de un volcado de errores.
      Los hooks no corren en shell interactiva, así que el PATH de cargo y Homebrew se
      arma explícitamente en vez de confiar en que se cargue un perfil.
      *Verificado:* sonda en los tres frentes —Rust mal formateado, un `any` de
      TypeScript, y formato de Prettier—; los tres detienen el commit. Con el árbol
      limpio pasa en **2,05 s**, que es el presupuesto que hace que `dev` siga siendo
      rápido.
      → `chore(hooks): add the pre-commit style hook`

- [x] **F0-8 — Workflows de CI.** `dev-check.yml` (push a `dev`: typecheck, lint,
      format, vitest y `cargo test -p gitcanvas-core`, solo ubuntu, sin instalar las
      librerías de sistema de Tauri porque el motor git no las necesita) y `quality.yml`
      (PR a `main`: matriz ubuntu/macos/windows con fmt, clippy `-D warnings`, tests,
      cobertura, drift de bindings y `tauri build`). Deltas D6 y D9.
      *Ampliación de alcance:* se configuró vitest en esta misma tarea. El CI llama a
      `npm run test` y ese script no existía; un workflow que referencia un script
      inexistente es un workflow roto. Entorno `node` por defecto —así el graph-layout
      no puede tocar el DOM ni por accidente— y los umbrales de cobertura del 90% ya
      declarados como glob sobre `src/lib/graph-layout/**`.
      *Verificado:* ambos workflows parsean con un parser YAML real. Y el chequeo de
      drift se probó de verdad: se agregó un campo al struct en Rust, `cargo test`
      regeneró `bindings.ts` y `git diff --exit-code` falló. El delta D6 deja de ser una
      casilla que alguien tilda.
      *Hallazgos durante la ejecución:* (1) Se comprobó que `generate_context!` **no**
      exige que exista `dist/` al compilar, así que los pasos de cargo no dependen del
      build del frontend. Solo `tauri build` lo necesita. (2) El hook de F0-7 detuvo
      este mismo commit: `coverage/` estaba en `.gitignore` pero no en los ignores de
      ESLint ni de Prettier, y lintear el reporte HTML generado reventaba con un error
      de type information. Habría roto el CI en el primer PR.
      → `ci: add the dev push check and the pull request quality matrix`

- [x] **F0-9 — Workflow de release.** Tag `v*.*.*` → extrae la sección del CHANGELOG →
      crea el Release. La extracción es el mismo `awk` de `ci4-website-suite`, que ya
      está probado en producción, y las notas se escriben a un archivo antes de pasarlas
      a `gh` para que el contenido del CHANGELOG no pueda inyectar shell.
      *Ampliado respecto de la referencia:* tres jobs en vez de uno. `create-release`
      publica en **borrador**, `bundle` construye instaladores en macOS (arm64 e Intel),
      Linux y Windows con `tauri-action` y los adjunta, y `publish` recién entonces lo
      saca de borrador — así nadie descarga un release al que le falta su plataforma.
      La firma de código queda fuera del MVP, pero el job `bundle` es exactamente donde
      va: agregar los secretos ahí es todo el cambio, sin reestructurar nada.
      *Verificado:* la extracción del CHANGELOG probada en los 4 casos —una versión del
      medio, la primera de la lista, una inexistente y `[Unreleased]` vacío—. Los dos
      últimos devuelven vacío, que es lo que hace abortar el workflow en vez de publicar
      un release sin notas.
      → `ci: add the changelog-driven release workflow`

- [x] **F0-10 — Nota de arquitectura.** `ARCHITECTURE.md`: el diagrama de capas, las
      tres fronteras con el mecanismo exacto que hace fallar el build en cada una, las
      reglas del código Rust, por qué el layout vive en TypeScript y no en Rust, y la
      tabla de qué corre en cada momento. Escrito para quien abra el repo sin contexto.
      → `docs: add the architecture note`

**Hecho cuando:** `cargo clippy --all-targets -- -D warnings` limpio · `npm run typecheck`
y `npm run lint` limpios · CI verde en los 3 SO · la ventana abre y `ping` hace roundtrip
Rust → TypeScript.

---

## 🔴 En progreso — Fase 1: Motor de datos Git (Rust)

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

- **Fase G — Bootstrap del repositorio** (6/6). Repositorio creado con `main` como punto
  de partida y `dev` como rama de trabajo, remoto privado en GitHub, y el guard local que
  impide pushear a `main`.

- **Fase 0 — Cimientos** (10/10). El esqueleto completo funciona antes de la primera línea
  de lógica de negocio: workspace Rust con la frontera del dominio aplicada por el
  compilador, TypeScript estricto con la frontera del graph-layout aplicada por ESLint,
  lints que deniegan `unwrap`/`expect`/`panic`, el pipeline de contratos tipados con su
  chequeo de drift, hook de pre-commit de 2 s, y los tres workflows de CI.
  **Cada frontera se verificó rompiéndola a propósito una vez.**
  *Verificación de cierre:* `cargo fmt --check` limpio · `cargo clippy --all-targets
  --all-features -- -D warnings` limpio · `cargo test --workspace` 3 tests en verde ·
  `bindings.ts` sin drift · typecheck, lint y format del frontend limpios.
