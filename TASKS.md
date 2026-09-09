# TASKS — GitCanvas

> Fuente de verdad de ejecución. El plan rector está en
> [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones de trabajo y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).

**Estado:** Release · 81/84 tareas · última actualización 2026-09-08

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

### Mantenimiento posterior a la fase

- [x] **F0-11 — Actions al día.** La primera corrida verde de `dev-check` anotó que
      `actions/checkout@v4` y `setup-node@v4` apuntan a Node 20, deprecado y forzado a
      correr sobre Node 24. Subidas a `@v7` en los tres workflows antes de que la
      deprecación se convierta en una falla.
      → `ci: bump the deprecated node 20 actions to v7`

---

- [x] **F0-12 — Alinear deployment target de macOS.** Fijar macOS 11.0 para Rust y
      las dependencias C vendorizadas. La primera compilación con libgit2/OpenSSL
      mostró objetos compilados para 13.1 enlazados contra el target 11.0 de Tauri.
      Se elimina la divergencia de toolchains en lugar de silenciar el linker.
      → `fix(build): align the macos deployment target for vendored libraries`

---

## ✅ Fase 1 — Motor de datos Git (11/11)

> Dado un path local, obtener commits, branches y tags de forma correcta y predecible,
> sin bloquear la UI, sin importar el tamaño del repositorio.

- [x] **F1-1 — `AppError` y validación de repositorio.** Enum único con `thiserror` +
      `serde` + `specta::Type`, y `From<git2::Error>` que convierte el mensaje a String
      (nunca serializa el objeto crudo). `ActiveRepo` solo se construye a través de la
      validación —canonicalizar, existe, contiene `.git`—, así que un path inválido es
      irrepresentable en vez de "validado en algún lado".
      → `feat(core): add the app error type and canonical repository validation`

- [x] **F1-2 — Tests de validación.** Fixtures en directorios temporales creados con la
      API de `git2`, nunca repos `.git` versionados en el proyecto.
      → `test(core): cover repository validation with temporary fixtures`

- [x] **F1-3 — Historial paginado por cursor.** Revwalk con
      `Sort::TOPOLOGICAL | Sort::TIME`, máximo 500 commits por página, cursor = SHA del
      último commit visto. Por cursor y no por offset: un offset produce bugs
      intermitentes si el historial cambia entre llamadas.
      *Hallazgo durante la ejecución:* un SHA no representa la frontera de ramas de
      un recorrido topológico. Cada página devuelve también sus raíces originales;
      las siguientes las reutilizan para no perder ramas ni duplicar commits cuando
      cambian las refs. No hay offsets ni handles compartidos.
      → `feat(core): add the cursor-paginated commit history walk`

- [x] **F1-4 — Tests de historial.** Lineal, un merge, branches divergentes, octopus,
      HEAD desprendido, repo vacío y el límite exacto de página.
      → `test(core): cover linear, merge, diverged and detached head histories`

- [x] **F1-5 — Resolución de refs.** Branches locales, remotas y tags, con `is_head`.
      → `feat(core): resolve local branches, remote branches and tags`

- [x] **F1-6 — Tests de refs.**
      → `test(core): cover ref resolution against the fixture repositories`

- [x] **F1-7 — Comandos IPC.** `open_repository`, `validate_repository`, `get_commits`,
      `get_branches`, `get_tags`. **Todos dentro de `spawn_blocking`**: `git2` es
      bloqueante y sin eso un repo grande congela la UI entera.
      *Hallazgo durante la ejecución:* cada petición lleva la identidad canónica del
      repo para que cambiar la selección durante una lectura no mezcle resultados.
      No se comparte la selección ni handles Git. F1-11 añade solo una caché acotada
      de SHAs. Los timestamps viajan
      como segundos decimales en String para preservar todo el rango i64 de Git.
      → `feat(ipc): expose the repository, history and refs commands`

- [x] **F1-8 — Tests de la capa de comandos.**
      → `test(ipc): cover the command layer against a temporary repository`

- [x] **F1-9 — Logging estructurado.** `tracing` a archivo rotativo en el directorio de
      datos de la app, para diagnosticar sin reproducir el bug en vivo.
      → `feat(app): add structured tracing to a rotating log file`

- [x] **F1-11 — Caché acotada del recorrido.** Hallazgo de las mediciones: el
      revwalk topológico vuelve a leer todos los ancestros en cada página. Conservar
      solo SHAs inmutables, por path y raíces, con LRU de ocho snapshots y 100.000
      commits totales. Nunca conservar handles Git ni resultados de repos distintos.
      → `perf(core): cache immutable history walks with bounded lru retention`

- [x] **F1-10 — CHANGELOG del motor de datos.**
      → `docs(changelog): record the git data engine`

**Hecho cuando:** la primera página de `ci4-website-suite` coincide commit por commit con
`git log` · p95 < 300ms en repos de hasta 10.000 commits (medido a mano y documentado; una
aserción de tiempo en un runner compartido es flaky por diseño) · cero `unwrap`/`expect`/
`panic`, garantizado por F0-4.

---

## ✅ Fase 2 — Layout del graph y render (9/9)

> El núcleo de valor del proyecto. Es la pieza que más cuidado necesita y la más difícil
> de verificar solo mirando la pantalla.

- [x] **F2-1 — Algoritmo de carriles reanudable.**
      `layout(commits, prev?) -> { rows, state }`, TypeScript puro, sin React ni DOM.
      Reanudable (delta D4) porque recalcular desde cero al cargar la página 2 reordena
      los carriles de la página 1 y el graph "salta" bajo el cursor: es un bug
      garantizado, no hipotético. Casos borde diseñados de entrada: octopus merge, commit
      inicial sin padres, y padres fuera de la página actual (indicador "continúa").
      → `feat(graph): add the resumable lane layout algorithm`

- [x] **F2-2 — Tests del layout.** Carril y color **exactos** por commit, no "que no
      explote". Incluye el test de dos páginas que afirma que los carriles de la primera
      no cambian al cargar la segunda.
      → `test(graph): cover linear, merge, octopus and page boundary layouts`

- [x] **F2-3 — Paleta determinística.** Color como función del índice de carril, ciclando
      sobre una paleta fija accesible. Nunca aleatorio: los colores no pueden parpadear
      entre renders o se rompe la sensación de predictibilidad del graph.
      → `feat(graph): add the deterministic accessible lane palette`

- [x] **F2-0 — Referencia de diseño y producto.** `DESIGN.md` y `PRODUCT.md`, generados
      con el skill `impeccable` en una sesión previa, quedaron sin commitear. Fijan los
      tokens visuales, la jerarquía de superficie y las restricciones de producto que la
      UI de la Fase 2 tiene que respetar; sin versionarlos, la próxima sesión rediseña
      desde cero. Extienden `docs/mockup.html`, no lo reemplazan.
      → `docs: add the design and product references`

- [x] **F2-4 — Tabla de commits virtualizada.** `@tanstack/react-virtual` con un único
      contenedor de scroll (delta D5): el layer del graph se pasa como `renderGraph` y se
      monta *dentro* del mismo contenido scrolleado, recibiendo la ventana de filas
      visibles. Dos contenedores sincronizados por JS derivan un frame en cada scroll;
      el código que los sincroniza no puede fallar si no existe. Geometría (alto de fila,
      ancho de carril, centros) en un módulo compartido para que la tabla y el graph no
      puedan discrepar en un píxel. Navegación con flechas, foco visible y roles
      `listbox`/`option`, según DESIGN.md.
      *Defecto encontrado y corregido por un test:* `formatCommitTime("")` devolvía
      `31 dic, 21:00` en vez de vacío, porque `Number("")` es `0` y `0` es finito. Un
      commit sin fecha habría mostrado la época Unix como si fuera real.
      *Endurecido respecto del plan:* `npm run lint` pasa a `--max-warnings=0`. Se
      descubrió que `eslint .` sale con 0 aun con warnings, así que el CI los habría
      dejado acumular en silencio — exactamente la deuda que este plan prohíbe.
      *Hallazgo durante la ejecución:* jsdom no implementa `ResizeObserver` ni layout, así
      que el virtualizer concluía que nada era visible y montaba cero filas. Resuelto con
      `src/test-setup.ts`, guardado por `typeof window`, de modo que los tests `node` del
      graph-layout siguen sin ver un DOM. Verificado con una sonda: `window` sigue siendo
      `undefined` ahí.
      *Verificado:* 5 tests del componente, incluido que con 5.000 commits monta menos de
      100 filas.
      → `feat(ui): add the virtualized commit table`
      → `feat(ui): add the virtualized commit table`

- [x] **F2-5 — Render SVG del graph.** Capa absoluta dentro del mismo contenedor de
      scroll de F2-4, dimensionada a la altura total del historial pero emitiendo
      geometría solo para las filas montadas más una a cada lado (delta D5). Rectas
      cuando el carril no cambia, Bézier cuando sí, con los puntos de control sobre la
      vertical para que la curva salga y llegue viajando hacia abajo y se lea como una
      línea continua, no como una diagonal. `aria-hidden`: la semántica la lleva la
      tabla, el SVG es decorativo.
      *Por qué una fila de margen alcanza:* el layout resuelve **todos** los cambios de
      carril en la mitad inferior de cada fila, así que ninguna arista cruza más de una
      fila. Dibujar la ventana visible ±1 es exacto, no una aproximación. Hay un test
      que lo afirma directamente: donde termina la arista de una fila empieza el tramo
      entrante de la siguiente, coordenada por coordenada.
      *Verificado:* con 5.000 commits y una ventana de 21 filas emite 23 nodos, no 5.000.
      → `feat(ui): render the commit graph as an svg layer over the virtual rows`

- [x] **F2-6 — Paginación infinita.** `useInfiniteQuery` sobre el cursor y los walk
      roots de F1-3, alimentando el layout reanudable de F2-1: cada página se dispone a
      partir del `state` de la anterior, nunca recalculando desde cero. Recalcular
      reasignaría carriles a commits que ya están en pantalla y el graph saltaría bajo el
      cursor mientras el usuario lee. `staleTime: Infinity` porque un historial ya
      recorrido es inmutable, y `retry: false` porque reintentar una lectura local solo
      demora mostrar el error.
      *Separación de estados:* React Query es dueño de todo lo que viene de Rust; un
      store de Zustand guarda solo lo que el usuario eligió —repo abierto y commit
      seleccionado—. Mezclarlos es cómo una invalidación de caché termina borrando una
      selección.
      *Ampliación de alcance:* shell completo de la app (toolbar, sidebar de ramas y
      etiquetas, estados de carga y error) y el plugin `tauri-plugin-dialog` para el
      selector nativo de carpetas. Sin eso el graph no tiene forma de recibir un
      repositorio y F2-6 no sería verificable.
      *El contrato hizo su trabajo:* inventé los nombres de las variantes de `AppError` al
      escribir los mensajes de la UI y el typecheck los rechazó contra `bindings.ts`. Los
      reales son `InvalidRepository`, `Io`, `Git`, `InvalidInput`, `StaleCursor` e
      `Internal`. Eso es exactamente lo que compra generar los tipos desde Rust.
      *Verificado con tests:* la página 1 se dispone idéntica exista o no la página 2; el
      resultado paginado es igual al de una sola pasada; y un merge cuyo segundo padre
      cae en la página siguiente aterriza en el carril exacto que le reservaron.
      → `feat(ui): load commit history through cursor-based infinite queries`

- [x] **F2-7 — Tests de render.** Test de integración de `HistoryView` con el IPC
      simulado: la tabla y el graph compuestos sobre un historial con la forma del
      mockup —`dev` mergeada a `main`—, verificando que dibuja un nodo por commit, que el
      merge sale como curva, que los resúmenes aparecen junto al graph, que un fallo se
      reporta en vez de mostrar un graph vacío, y que pide la página siguiente con el
      cursor correcto.
      *Verificación contra el repositorio real* (`GITCANVAS_REFERENCE_REPO`
      = ci4-website-suite): los 50 primeros commits coinciden **hash por hash** con
      `git log --all --topo-order`.
      *Presupuesto de performance, medido:* con 10.000 commits y páginas de 500, sobre 50
      muestras — empaquetado **p95 = 47,9 ms**, empaquetado con caché **p95 = 3,7 ms**.
      El objetivo del plan era 300 ms, así que se cumple con holgura en el estado normal
      de un repositorio. **Pero con 10.000 objetos sueltos el p95 sube a 450 ms y no se
      cumple.** Queda anotado en vez de disimulado: es un caso poco común porque git
      compacta solo, y la caché lo baja a 31 ms, pero la primera lectura de un repo sin
      compactar excede el presupuesto.
      → `test(ui): cover graph rendering for the fixture histories`

- [x] **F2-8 — CHANGELOG del graph.** Entradas de la Fase 2 bajo `[Unreleased]`: el
      graph, el layout reanudable, la paginación por cursor y la navegación del
      repositorio.
      → `docs(changelog): record the commit graph`

**Hecho cuando:** el historial real de `ci4-website-suite` se dibuja con el merge de la
PR #1 y `dev` bifurcándose, como en `docs/mockup.html`, sin cruces innecesarios · scroll a
60fps con 12 carriles activos · cobertura ≥90% en `lib/graph-layout/`.

---

## ✅ Fase 3 — Detalle de commit y diff (6/6)

- [x] **F3-1 — Diff contra el primer padre.** `get_commit_diff` con detección de renames
      sobre el diff ya generado —así un rename puro se lee como una entrada y no como un
      alta y una baja sin relación—. Guards: binario detectado por libgit2 → sin texto de
      patch; más de 2.000 líneas → retenido hasta que se pida por ruta. `patch` es `None`
      siempre que `omitted` está puesto, así que los dos no pueden contradecirse sobre si
      hay algo que renderizar. Los conteos de líneas quedan disponibles aunque el texto no.
      El diff combinado de merges queda documentado como limitación conocida y el payload
      trae `is_merge` para que la UI pueda decirlo.
      → `feat(core): add the first-parent commit diff with binary and size guards`

- [x] **F3-2 — Tests de diff.** Siete casos sobre repositorios temporales: commit raíz
      contra el árbol vacío, altas/modificaciones/bajas, un merge diffeado contra su
      primer padre, contenido binario, un diff de más de 2.000 líneas retenido y luego
      expandido explícitamente, un archivo sin salto de línea final, y un commit
      inexistente que da error en vez de un diff vacío.
      *Ampliación:* el fixture de la Fase 1 solo construía árboles vacíos; se le agregó
      `commit_files` para poder commitear contenido real, que es lo único con lo que un
      test de diff puede afirmar algo.
      *Hallazgo durante la ejecución:* clippy pedantic rechazó `patch` por ser demasiado
      parecido a `path`. Renombrado a `hunks` — es un punto legítimo de legibilidad en un
      módulo donde las dos cosas conviven en cada línea.
      → `test(core): cover diffs for text, binary and oversized files`

- [x] **F3-3 — Comando IPC de diff.** `get_commit_diff` expuesto por `collect_commands!`,
      corriendo en `spawn_blocking` como todo lo que toca libgit2, más el wrapper tipado
      en `lib/ipc/`. Los tipos `CommitDiff`, `FileDiff`, `FileChange` y `DiffOmission`
      aparecieron solos en `bindings.ts` al regenerarlo: no se escribió ni una línea de
      TypeScript para describirlos.
      → `feat(ipc): expose the commit diff command`

- [x] **F3-4 — Panel de detalle.** Identidad del commit, autor, cuerpo del mensaje
      cuando difiere del resumen, y la lista de archivos con sus estadísticas. Cuando el
      commit es un merge lo dice explícitamente: *se muestran los cambios contra el primer
      padre*, para que la limitación conocida sea visible donde importa y no solo en el
      README. Inspector de 310px según DESIGN.md, que baja debajo del historial por
      debajo del mínimo de escritorio en vez de exprimir el mensaje del commit.
      → `feat(ui): add the commit detail panel`

- [x] **F3-5 — Visor de diff.** Parser de patch unificado propio en vez de una librería.
      *Desvío del plan, con motivo:* el plan indicaba `react-diff-view` para no construir
      un visor a medias. Pero el guard de F3-1 ya resuelve lo que hace peligroso a un
      visor casero —binarios y diffs enormes nunca llegan como texto—, y libgit2 entrega
      un patch unificado ya normalizado. Lo que queda es clasificar líneas, que son 40
      líneas cubiertas por 7 tests, contra una dependencia con su propio CSS y su propio
      modelo de datos. Si aparece la necesidad de vista lado a lado o resaltado de
      sintaxis, cambiar a la librería es sustituir un componente.
      Los encabezados `diff --git`, `index`, `---` y `+++` se descartan porque el panel
      ya muestra el archivo arriba; los `@@` se conservan porque son la única señal de
      que se saltaron líneas, y `\ No newline at end of file` también.
      Binarios y diffs retenidos muestran una explicación, nunca una caja vacía.
      *Nota de proceso:* F3-4 y F3-5 aterrizaron en **un solo commit**
      (`feat(ui): add the commit detail panel`) en lugar de dos. El panel no renderiza
      sin el visor y el visor no tiene dónde montarse sin el panel, así que en la
      práctica son una sola razón para que cambie el historial. Se deja anotado en vez
      de reescribir el historial para aparentar dos.

- [x] **F3-6 — CHANGELOG del panel de detalle.** Entradas de la Fase 3 bajo
      `[Unreleased]`, incluida la limitación conocida del diff de merges.
      → `docs(changelog): record the commit detail panel and diff viewer`

**Hecho cuando:** el diff de cualquier commit coincide con `git show` · un binario o un
diff gigante no bloquea ni ralentiza perceptiblemente la UI.

---

## ✅ Fase 4 — Integración con GitHub (9/9)

- [x] **F4-1 — Token en el keychain del SO.** Crate `keyring` v3 con las tres features
      de plataforma explícitas (`apple-native`, `windows-native`,
      `sync-secret-service`): el crate no trae features por defecto, así que omitirlas
      compila y falla en runtime.
      **El token no sale del crate.** `read_token` es `pub(crate)`: se escribe acá, se lee
      acá, y se entrega directo al callback de credenciales de libgit2 o a un header. La
      UI puede preguntar `has_token()`, nunca cuál es. No cruza el IPC ni enmascarado.
      `delete_token` es idempotente: cerrar sesión sin sesión abierta no es un error,
      porque el estado deseado ya se cumple.
      *Sobre el delta D2:* esto reemplaza a Stronghold, que el diseño original nombraba.
      Stronghold está deprecado y se elimina en Tauri v3, y además exigiría una
      contraseña del usuario o un lugar donde guardar su propia clave de cifrado.
      → `feat(core): add the github token store backed by the os keychain`

- [x] **F4-2 — Cliente REST de GitHub.** `ureq` con `rustls` en vez del TLS del sistema,
      por la misma razón por la que libgit2 va vendorizado: comportamiento idéntico en las
      tres plataformas. Solo dos endpoints — `/user` para validar el token y
      `/user/repos` para el selector. Todo lo que el graph muestra sigue saliendo del
      clone local. Un 401 o 403 se reporta como `InvalidInput`, no como error interno:
      un token vencido es algo que el usuario arregla, no una falla de la app.
      Paginación acotada a 10 páginas para que una cuenta enorme no cuelgue el selector.
      → `feat(core): add the github rest client for token and repository listing`

- [x] **F4-3 — Tests del cliente.** Siete casos contra un servidor HTTP local levantado
      en el propio test: sin red, sin token real, sin límite de tasa, y con cada camino
      de error realmente provocable. Cubre token válido, 401, 403, payload malformado,
      un repo sin `default_branch`, y que la paginación se detenga en la primera página
      corta.
      *El test que más importa:* que el token viaje **solo** en el header `Authorization`
      y nunca en la URL — un token en la query string termina en los logs del servidor y
      en el historial del proxy.
      *Hallazgo durante la ejecución:* el test fallaba comparando `Authorization:` con
      mayúscula. `ureq` v3 normaliza los nombres de header a minúsculas, como exige
      HTTP/2. El bug era del test: los nombres de header son case-insensitive por RFC
      9110.
      → `test(core): cover the github client against a mocked transport`

- [x] **F4-4 — Clone completo con progreso.** **Nunca shallow**, y el comentario del
      módulo dice por qué: un `--depth` trunca el historial, y la forma del historial es
      el producto entero. Un graph truncado sería visualmente convincente y falso, que es
      peor que negarse. El callback de credenciales lee el token del keychain y se lo pasa
      directo a libgit2 — nunca vuelve a un llamador. Un clone interrumpido se borra en
      vez de quedar como un repositorio a medias que después se confunde con uno bueno.
      Un directorio existente que no abre como repositorio se trata igual.
      → `feat(core): add full repository cloning with progress reporting`

- [x] **F4-5 — Retención LRU de la caché.** 10 repositorios o 5 GB, lo que se cumpla
      primero. El parámetro `keep` protege al repositorio que el usuario acaba de abrir,
      para que no pueda borrarse a sí mismo al llegar. Usa `mtime` en vez de `atime`
      porque el tiempo de acceso no se actualiza de forma confiable en todos los sistemas
      de archivos.
      → `feat(core): add the lru retention policy for the clone cache`

- [x] **F4-6 — Tests de retención.** Seis casos sobre directorios reales con `mtime`
      fijado explícitamente, para que el orden LRU lo decida el test y no la velocidad de
      la máquina: caché inexistente, orden por recencia, nada que expulsar dentro de los
      límites, expulsión del más viejo al pasarse, y el repo en uso protegido.
      *El test que más importa:* que `cache_entry_name` aplane el nombre a un solo nivel,
      de modo que `../../etc/passwd` no pueda escapar de la raíz de la caché.
      → `test(core): cover the clone cache retention policy`

- [x] **F4-7 — Comandos y evento IPC.** Seis comandos y el evento tipado
      `CloneProgressEvent`, generado por `collect_events!`. El token se guarda **después**
      de verificarlo contra `/user`, así un token que no puede funcionar nunca queda
      almacenado como causa invisible de un clone que falla más tarde. Ninguno de los
      comandos devuelve el token: `has_github_token` responde sí o no.
      *Rediseño durante la ejecución:* los comandos tomaban `AppHandle` para resolver el
      directorio de caché y emitir progreso, y eso los ata al runtime concreto —
      `collect_commands!` no puede ver el parámetro `R` de una función genérica y el build
      fallaba. En vez de forzarlo, se sacó `AppHandle` de los comandos: la raíz de la
      caché y el emisor de progreso pasan a ser estado inyectado, resuelto una sola vez en
      el arranque donde el handle concreto sí existe. El emisor es un `Arc<dyn Fn>`, así
      que la capa de comandos ni siquiera sabe cómo se entregan los eventos. Es el mismo
      patrón que ya usaba `get_commits` con el `HistoryReader`.
      *Hallazgo durante la ejecución:* specta **rechaza exportar `u64`** por pérdida de
      precisión en JavaScript, así que los tamaños de la caché cruzan como string decimal
      — la misma convención que ya usaban los timestamps de commit en la Fase 1. Al
      cambiarlo hubo que ordenar numéricamente en vez de lexicográficamente, o `"9"`
      quedaría después de `"10"`.
      → `feat(ipc): expose the github commands and the clone progress event`

- [x] **F4-8 — Selector de repos y progreso en la UI.** Alta de token, listado de
      repositorios accesibles, clone con progreso y apertura automática del clone. El
      campo del token es `type="password"` y el texto explica dónde se guarda. Mientras
      GitHub sigue contando objetos el progreso dice *Preparando…* con los MB recibidos en
      vez de inventar un porcentaje: `total_objects` es 0 hasta que el servidor termina de
      contar, y un 0% que no avanza parece que se colgó.
      La suscripción al evento de progreso se desmonta en el cleanup del efecto, así que
      no se acumula una por re-render.
      *Verificado:* 7 tests, incluido que el campo sea de contraseña, que un token vacío
      no se pueda enviar, que un token rechazado se reporte, y que el listener de progreso
      se dé de baja al desmontar.
      → `feat(ui): add the github repository picker and clone progress`

- [x] **F4-9 — CHANGELOG de GitHub.** Integración, custodia del token en el llavero y
      límites de la caché, bajo `[Unreleased]`.
      → `docs(changelog): record the github integration`

**Hecho cuando:** una URL pública se clona y muestra su graph completo · un repo privado se
lista y clona con PAT · `grep -ri "ghp_\|gho_" "$HOME/Library/Application Support/gitcanvas"`
no devuelve nada.

> David necesita generar un PAT con scope `repo` y pegarlo en la app para probar repos
> privados. No se toma de `gh auth token`: es su credencial y la app tiene que ejercitar
> su propio camino de almacenamiento.

---

## ✅ Fase 5 — Acciones básicas (8/8)

- [x] **F5-1 — Checkout con guard.** Devuelve `Blocked { conflicts }` con las rutas
      concretas que se perderían, en vez de un booleano. Los archivos sin trackear no
      cuentan como conflicto porque sobreviven al checkout. Dos líneas de defensa: el
      chequeo de `statuses` primero, y `CheckoutBuilder::safe()` de libgit2 detrás.
      → `feat(core): add guarded branch checkout`

- [x] **F5-2 — Pull solo fast-forward.** `merge_analysis` decide, y si las historias
      divergieron devuelve `DivergedRequiresMerge { local, remote }` con los dos nombres
      para que la UI pueda explicarlo. Sin upstream configurado devuelve `NoUpstream`, que
      es un estado, no un error.
      *Nota de proceso:* F5-1, F5-2 y F5-3 viven en `actions.rs` y aterrizaron en un
      solo commit (`feat(core): add guarded branch checkout`). Los tres comparten el
      callback de credenciales y los tipos de resultado, así que separarlos habría dejado
      commits que no compilan. Se anota en vez de reescribir el historial.
      → `feat(core): add fast-forward only pull`

- [x] **F5-3 — Push con credenciales del keychain.** Token del llavero para HTTPS y
      agente SSH como alternativa. Un rechazo por no-fast-forward se reporta como
      `RejectedNonFastForward`, **nunca se reintenta con force**: que el remoto tenga
      commits que el local no tiene es exactamente el caso donde forzar destruye trabajo
      ajeno. Un fallo de autenticación se distingue de un fallo de red.
      → `feat(core): add push with keychain-backed credentials`

- [x] **F5-4 — Tests de acciones.** Ocho casos sobre repositorios reales: checkout limpio,
      checkout bloqueado, archivo sin trackear que no bloquea, force que sí descarta,
      branch inexistente, pull sin upstream, push con HEAD desprendido y push sin remoto.
      *Los dos que más importan:* tras un checkout rechazado, el archivo conserva su
      contenido **y** HEAD sigue donde estaba —no basta con devolver el error, hay que no
      haber tocado nada—; y un push sin `origin` configurado no puede reportar éxito.
      *Hallazgo durante la ejecución:* en git2 0.21 `Reference::name`, `shorthand` y
      `Buf::as_str` devuelven `Result`, no `Option`, y `Oid::zero()` está deprecado. Es
      una mejora: el error se propaga con `?` en vez de tragarse con `unwrap_or_default`.
      → `test(core): cover checkout guards, fast-forward pull and push failures`

- [x] **F5-5 — Comandos IPC de acciones.** `checkout_branch`, `pull_fast_forward` y
      `push_current_branch`. `force` es un parámetro y no un comando aparte, así que el
      camino confirmado y el no confirmado no pueden divergir.
      *Endurecido durante la ejecución:* los tres enums de resultado se serializan con
      `#[serde(tag = "kind")]`, la misma convención que ya usaba `AppError`. Sin eso
      specta genera el formato externamente etiquetado —`{ Pushed: {...} } & { Rejected?:
      never }`— que en TypeScript obliga a mirar qué clave existe antes de leer nada. Con
      el tag interno queda una unión discriminada que se narrowea con un `switch`.
      → `feat(ipc): expose the checkout, pull and push commands`

- [x] **F5-6 — Toolbar con confirmaciones.** Push y checkout forzado piden confirmación en
      un `<dialog>` nativo: el foco queda atrapado, Escape cancela y el fondo es inerte
      sin reimplementar nada de eso. **El foco inicial va a Cancelar**, porque la
      respuesta segura tiene que ser la que da un Return distraído.
      Cada resultado del backend se traduce a una frase que dice qué pasó y qué hacer:
      un push rechazado explica que hay que traer los commits con pull, y un pull
      divergente dice que el merge se resuelve desde la línea de comandos. El diálogo de
      checkout forzado lista las rutas concretas que se van a perder.
      *Hallazgo durante la ejecución:* el botón de confirmar decía "Push", igual que el de
      la toolbar. Ambiguo para el test y para el usuario; ahora dice "Enviar".
      *Código muerto eliminado:* se había exportado un hook `useCheckout` que nada usaba.
      ESLint lo marcó por romper fast refresh, y se borró en vez de silenciar el aviso.
      *Verificado:* 6 tests, incluido que un push **nunca** ocurre sin confirmación y que
      un rechazo no se reintenta con force.
      → `feat(ui): add toolbar actions with destructive action confirmations`

- [x] **F5-7 — E2E del camino crítico.** WebdriverIO + `@wdio/tauri-service` (delta D7),
      contra el **binario de release real**, no un dev server. Tres tests en verde: el
      graph se dibuja sobre las filas, el merge sale como curva, y seleccionar un commit
      muestra su diff.
      *El WebDriver no llega al binario publicado.* El servicio exige
      `tauri-plugin-wdio-webdriver` registrado, y distribuir una app manejable
      remotamente es un pasivo. Aislado tras el feature `e2e` de Cargo, verificado con
      `cargo tree` (0 referencias por defecto, 1 con el feature) y con un paso de CI que
      **falla** si alguna vez entra al build por defecto.

      *Esta tarea encontró un bug que se habría publicado.* Al intentar correr el E2E de
      verdad apareció que **ningún plugin de Tauri estaba registrado** — tampoco el de
      diálogo. El crate estaba en `Cargo.toml`, así que linkeaba, salía en `cargo tree` y
      hasta en `strings` del binario. Compilaba, clippy pasaba, los 7 tests pasaban. Pero
      el botón "Abrir repositorio" habría fallado en runtime con un error de plugin
      faltante. Declarar una dependencia y registrarla son cosas distintas, y ningún type
      check ve la diferencia. Corregido, con un test de regresión que falla por
      exactamente ese motivo.

      *Otros cuatro hallazgos:* (1) `tauri build` en macOS se cuelga creando el DMG —
      `bundle_dmg.sh` posiciona iconos vía AppleScript y espera a Finder—, así que el E2E
      apunta al binario plano; el bundling no aporta nada a lo que este test verifica.
      (2) Sin `tauri/custom-protocol` el binario busca el dev server y la ventana arranca
      en blanco. (3) La opción del servicio se llama `appArgs`, no `args`, y va en las
      opciones del servicio, no en la capability — por eso el repositorio nunca llegaba.
      (4) `toHaveTextContaining` se eliminó en WebdriverIO v9.

      *Endurecido:* `get_startup_repository` escanea **todos** los argumentos en vez de
      asumir `argv[1]`, porque un lanzador puede anteponer los suyos —que es justo lo que
      hace este harness—, con `GITCANVAS_REPOSITORY` como alternativa.
      → `test(e2e): cover the open repository to diff critical path`

- [x] **F5-8 — CHANGELOG de acciones.** Checkout guardado, pull fast-forward, push con
      confirmación y la apertura por línea de comandos, más las dos limitaciones
      conocidas correspondientes.
      → `docs(changelog): record the checkout, pull and push actions`

**Hecho cuando:** checkout con working tree limpio funciona y con cambios pendientes se
bloquea con mensaje claro · pull ff funciona y un caso que requiere merge se informa sin
intentar resolverlo.

---

### Mantenimiento posterior a la fase

- [x] **F2-9 — El graph ya no se dibuja sobre el texto.** Al capturar la app contra este
      mismo repositorio se vio que la línea de carril atravesaba el mensaje de cada
      commit. Causa: las filas son `position: absolute`, y una caja absoluta resuelve
      `left` contra la **caja de padding**, así que el `padding-left` del contenedor se
      ignoraba por completo. Reemplazado por una custom property `--graph-width` aplicada
      al `left` de cada fila.
      *Por qué ningún test lo detectó:* jsdom no calcula layout, así que ningún test de
      componente puede ver un solapamiento visual. El test de regresión afirma el
      mecanismo —que el offset viaja como `--graph-width` y no como padding— que es lo
      máximo que se puede comprobar sin un motor de layout. El E2E tampoco lo veía porque
      consulta el DOM, no píxeles.
      → `fix(ui): offset commit rows past the graph column`

---

### Ola UX — Navegación estilo GitKraken

> David compartió capturas de GitKraken: la lista de archivos vive en el panel derecho y
> el diff ocupa el panel **central completo**. El inspector de 310px hacía ilegible
> cualquier diff con indentación.

- [x] **UX-1 — El diff ocupa el panel central.** Elegir un archivo en el panel derecho
      reemplaza el graph por `FileDiffView` a ancho completo, con encabezado (ruta,
      commit, estadísticas), botón de volver y **Escape** para cerrar. El panel derecho
      pasa a ser navegación: lista los archivos con su marca de cambio (A/M/D/R/C/T) y
      sus conteos, sin diffs embebidos.
      *Un solo interruptor:* `selectedFilePath` decide qué muestra el centro. No hay una
      bandera aparte de "qué vista" que pueda contradecirlo.
      *Estado que se limpia solo:* cambiar de commit cierra el archivo abierto —la misma
      ruta en otro commit es otro diff, y cambiar el contenido bajo el lector es peor que
      volver al graph—. Y `expandedFilePath` es independiente de `selectedFilePath`:
      abrir un archivo grande y pedir verlo entero son decisiones distintas.
      *Una sola consulta:* `useCommitDiff` la comparten la lista y el visor, así React
      Query los sirve de la misma entrada de caché y no pueden discrepar sobre qué cambió.
      → `feat(ui): open file diffs in the centre panel`

- [x] **UX-2 — El sidebar navega.** Cada rama y etiqueta es un botón que lleva al último
      commit de ese ref, marcándolo como seleccionado. El ref cuyo commit está
      seleccionado se resalta, así el sidebar refleja dónde estás.
      *Bug evitado por el contrato:* usé `tag.target` para navegar, pero en un tag anotado
      ese es el **objeto tag**, no el commit — habría buscado un id que no está en la
      lista. El typecheck lo rechazó contra `bindings.ts`; lo correcto es `commit_id`.
      Un tag que no resuelve a un commit se muestra deshabilitado, no inerte.
      *Scroll robusto:* `revealCommitId` es declarativo, no un handle imperativo. Si el
      commit no está cargado, `HistoryView` sigue pidiendo páginas hasta encontrarlo o
      hasta agotar el historial — `hasNextPage` es lo que hace que termine, en vez de un
      tope de páginas arbitrario que podría parar justo antes.
      → `feat(ui): navigate to a branch tip from the sidebar`

- [x] **UX-3 — Truncado de rutas.** El directorio colapsa antes que el nombre del
      archivo, que es lo que se busca. `flex-shrink: 99999` en el directorio y `1` en el
      nombre: el nombre solo cede cuando el directorio ya desapareció.
      *Dos defectos vistos en captura, no en tests:* la primera versión usaba
      `direction: rtl` en toda la fila y alineaba los nombres a la derecha; la segunda
      dejaba que un nombre largo se montara sobre sus estadísticas. Ninguno era
      detectable sin layout real — la misma limitación de jsdom que dejó pasar el
      solapamiento del graph en F2-9.
      → `fix(ui): truncate the directory before the file name`

---

### Ola UX-2 — Auditoría dirigida de la interfaz

> Hecha manejando la app con el harness de E2E y midiendo el DOM, no imaginando
> problemas. Once chequeos automatizados sobre la app real.

- [x] **UX-4 — El historial ya no se reacomoda al seleccionar.** La auditoría midió el
      grid: `220px 1292px` sin selección y `220px 982px 310px` con ella. Cada click
      encogía el historial 310px, reflowing todas las filas y redibujando el graph bajo
      el cursor que acababa de hacer click. La columna del inspector ahora se reserva
      siempre, con un estado vacío que además dice qué hacer.
      → `fix(ui): reserve the inspector column so selecting a commit never reflows the history`

- [x] **UX-5 — Paneles redimensionables.** Divisores arrastrables **y operables con
      flechas**, anunciados como `separator` con `aria-valuenow`: un divisor que solo
      responde al mouse no es un control, es decoración. Doble click restaura el medio.
      Usa pointer capture en vez de listeners de ventana, así el arrastre no se traba si
      el puntero sale de la ventana. Los anchos persisten en `localStorage`, con toda
      lectura acotada por si viene de una build vieja o editada a mano.
      *Defecto que encontró mi propio test:* con los máximos fijos (420 + 620 = 1040px) y
      la ventana en su mínimo (940px), el historial quedaba en **negativo**. Los límites
      ahora se derivan del ancho real de la ventana menos el otro panel menos
      `HISTORY_MIN`, y se recalculan al redimensionar.
      *Corregido dos veces por el linter:* las dos primeras versiones corregían el estado
      dentro de un efecto, provocando renders en cascada. Derivar el ancho efectivo es
      además mejor comportamiento: al agrandar la ventana, el panel vuelve al ancho que
      el usuario eligió, en vez de quedar recortado para siempre.
      → `feat(ui): let the sidebar and inspector be resized`

- [x] **UX-6 — Pastillas de rama y tag en las filas.** Estaban en el mockup aprobado y no
      se habían implementado: la auditoría contó **0 badges**. Sin ellas hay que
      contrastar el graph contra el sidebar para saber dónde apunta cada rama. La rama
      activa lleva el color de acento. No cuesta ninguna petición extra: se arman desde
      las consultas de ramas y tags que el sidebar ya hacía.
      *El tag resuelve a su commit*, no al objeto tag — la misma trampa de UX-2.
      → `feat(ui): show branch and tag badges on the commits they point at`

- [x] **UX-7 — Búsqueda de commits.** El otro elemento del mockup que faltaba: la
      auditoría contó **0 campos de texto**. Busca por mensaje, autor o hash abreviado
      —por prefijo, como acepta `git show`, no por subcadena—. Cmd-F enfoca, Enter
      recorre las coincidencias, Shift-Enter va hacia atrás, Escape limpia. El contador
      dice "1 de 2"; y dice explícitamente que busca en **el historial cargado**, en vez
      de dar a entender que buscó todo el repositorio.
      *Derivado, no encadenado:* la posición recorrida se guarda junto a la consulta a la
      que pertenece, así una consulta nueva empieza de cero por derivación. Reiniciarla
      en un efecto renderiza una vez con la posición anterior antes de corregirse.
      → `feat(ui): add commit search by message, author or hash`

- [x] **UX-8 — Rutas legibles a cualquier ancho.** Al ensanchar el inspector se vio
      `…rc/components/CommitTablCommitTable.test.tsx`: truncar por la izquierda corta el
      directorio a mitad de token y lo pega al nombre. Invertido al orden que usan los
      editores —nombre primero, directorio atenuado después—, que además elimina el truco
      de `direction: rtl` por completo.
      *Y el título de la ventana nombra el repositorio*, que la auditoría reportó como
      siempre "GitCanvas".
      → `fix(ui): lead the file list with the file name and follow with its directory`

---

### Ola UX-3 — Lectura de archivos y ergonomía

- [x] **UX-9 — Ver el archivo completo, no solo el diff.** Comando nuevo en el core
      (`get_file_content`) con los mismos guards que el diff: binario nunca vuelve como
      texto, y más de 5.000 líneas se retienen hasta pedirlas. Un archivo con un byte
      inválido **se muestra igual** con un carácter de reemplazo, en vez de esconderse.
      El conmutador Cambios/Archivo completo no se ofrece si el commit borró el archivo:
      ofrecerlo y después fallar es peor que no ofrecerlo.
      *Derivado, no reiniciado:* el modo elegido se guarda junto al archivo al que
      pertenece, así abrir otro vuelve a su diff por derivación. Un efecto que lo
      reinicia renderiza el archivo nuevo una vez en el modo del anterior.
      → `feat(core): read a file's full contents at a commit` · `feat(ipc): expose the file content command` · `feat(ui): show a file in full, not only its changes`

- [x] **UX-10 — Números de línea y ajuste de texto.** Los números salen de las cabeceras
      `@@`, no de contar filas: un patch salta todo lo que hay entre hunks, así que un
      contador corrido se desfasaría en el segundo. Son celdas reales y no contenido
      generado, así que seleccionar el código **no arrastra los números** — que es lo que
      vuelve inservible un fragmento copiado. Una tabla de líneas compartida sirve tanto
      al patch como al archivo completo.
      → `feat(ui): number diff lines and allow wrapping long ones`

- [x] **UX-11 — El sidebar cede su ancho al leer un archivo.** Idea de David: las ramas
      son navegación entre commits, y un archivo no es uno. Un control en la toolbar lo
      vuelve a fijar para quien lo quiera igual. Esto reemplaza además la media query que
      lo escondía bajo 1000px sin avisar.
      *Bug grave introducido y corregido:* colapsar el sidebar dejaba de renderizar 2 de
      los 5 hijos del grid, pero el grid seguía declarando 5 columnas. Los 3 restantes se
      corrían: **el visor de archivo caía en la columna del sidebar (0px, invisible)** y
      el inspector se expandía al `1fr`, ocupando toda la pantalla con la lista de
      archivos. David lo detectó mirando la app; ningún test lo veía. Colapsar ahora es
      solo ancho — los hijos son siempre cinco.
      *Cómo se evita que vuelva:* un test afirma que `.app-shell__body` tiene siempre 5
      hijos en los tres estados (nada seleccionado, commit seleccionado, archivo abierto),
      y un E2E mide la geometría real: `0px 0px 899px 1px 539px`, con el visor en 900px.
      La lección de F2-9 otra vez — jsdom no calcula layout, así que el invariante que se
      puede afirmar sin él es el **conteo de hijos**, no el resultado visual.
      → `feat(ui): collapse the sidebar while a file is open` · `fix(ui): keep the grid children matched to its columns when collapsing`

- [x] **UX-12 — Menú contextual y nombres accesibles.** Click derecho sobre un commit
      copia hash corto, hash completo, mensaje o autor, con el resultado **anunciado**
      —importa a quien no ve el portapapeles, y un aviso visual en la esquina se lo
      pierde todo el mundo—. El menú se cierra al hacer scroll: uno anclado a un punto
      mientras la lista se mueve apunta al commit equivocado cuando se usa.
      Y cada fila lleva `aria-label` explícito: el DOM concatenaba
      `…2e53be608-sept, 04:56 p.m.`, leyendo el hash pegado a la fecha.
      → `feat(ui): copy a commit's hash, message or author from a context menu`

---

### Ola UX-4 — La espera del selector de carpetas

- [x] **UX-13 — El botón dice que está trabajando.** David reportó una espera larga sin
      señal alguna al pulsar *Abrir repositorio*.
      *Diagnóstico:* no es la librería. `tauri-plugin-dialog` usa `rfd 0.16` sobre
      `objc2-app-kit`, o sea **`NSOpenPanel` directo, sin subproceso** — el camino más
      rápido disponible en macOS. El costo es la inicialización del panel del sistema,
      que macOS paga la primera vez y que la app no puede eliminar.
      *Lo que sí era culpa nuestra:* `setBusy(true)` estaba **después** del `await`, así
      que durante toda la espera el botón no mostraba nada. Ahora el estado se marca
      antes, con spinner y texto que distingue las dos fases —*Elegí una carpeta…*
      mientras el panel está arriba, *Abriendo…* mientras se valida el repositorio— y
      `aria-busy` para quien no ve el spinner.
      *Doble apertura, evitada:* un segundo click durante la espera apilaba un segundo
      panel detrás del primero, algo de lo que no se sale desde la interfaz. Guardado con
      un ref, porque la protección tiene que valer dentro del mismo tick del click.
      *Cancelar libera el botón:* el reset va en `finally`, así descartar el panel no deja
      el botón deshabilitado para siempre.
      *Y de paso:* recuerda el directorio de la última apertura y arranca ahí, que además
      de ser mejor de usar le ahorra al panel resolver la ubicación por defecto.
      *Verificado:* 6 tests, incluidos los dos que suelen romperse —cancelar y hacer
      doble click— y que la opción `defaultPath` se **omita** en vez de pasar `undefined`,
      que con `exactOptionalPropertyTypes` no es lo mismo.
      → `fix(ui): show the repository picker working while the native panel opens`

- [x] **UX-14 — Por qué el indicador no se veía, y el precalentamiento.** El arreglo
      anterior era correcto pero seguía sin verse nada. La causa real: el plugin
      construye el panel con `run_on_main_thread`, y en macOS **el WebView pinta en ese
      mismo hilo**. Marcar el estado ocupado y llamar al diálogo en el mismo frame
      significa que el hilo queda tomado antes de que el navegador llegue a dibujar el
      spinner. Resuelto cediendo un repintado (`afterPaint`, dos `requestAnimationFrame`)
      antes de la llamada bloqueante.
      *Precalentamiento, como pidió David:* al arrancar se construye y descarta un
      `NSOpenPanel`, lo que fuerza a AppKit a cargar el framework e inicializar la clase
      —el grueso del costo de la primera apertura— mientras nadie está esperando. El
      binding `openPanel` de `objc2-app-kit` es una función **segura**, así que el
      `unsafe_code = "forbid"` del workspace sigue intacto.
      *Diagnóstico previo, descartado:* se verificó que el código sí estaba instalado
      (dist 19:28, bundle 19:30). `strings` sobre el binario no lo encontraba porque
      Tauri comprime los assets, no porque faltara.
      → `perf(app): pre-initialise the system folder panel at startup`

- [x] **UX-15 — Español neutro en toda la interfaz.** David lo pidió varias veces: nada
      de voseo. Corregidos "Elegí una carpeta", "Abrí un repositorio", "Volvé a abrir el
      repositorio", "Pegá un Personal Access Token", "Traelos con pull" y "Elegí un
      commit". Queda un grep de verificación anotado en la memoria del proyecto.
      → `fix(ui): use neutral spanish across the interface`

---

### Ola UX-5 — El repositorio en vivo

- [x] **UX-16 — La ventana refleja el repositorio, no una foto de él.** David hizo un
      commit desde fuera y la aplicación no lo mostró.
      *Decisión mía que estaba mal:* `staleTime: Infinity` en el historial, razonando que
      "un historial ya recorrido es inmutable". Cierto para un recorrido dado, **falso
      para un repositorio vivo**: las referencias se mueven y llegan commits. Con
      `refetchOnWindowFocus: false` encima, no había forma de enterarse nunca.
      *Solución:* vigilancia del directorio de metadatos con `notify`, en el crate de
      dominio y sin que sepa que Tauri existe — recibe un callback, y `src-tauri` lo
      conecta a un evento tipado.
      *Tres decisiones que la hacen robusta:*
      **(1)** Se vigila solo el directorio de metadatos, nunca el árbol de trabajo: una
      vigilancia sobre el checkout completo se dispara con cada archivo guardado y en un
      repositorio grande cuesta miles de descriptores por información que no se usa.
      **(2)** Los eventos se agrupan con 250 ms de espera: un commit reescribe el índice,
      una referencia y el reflog, llegando como una docena de eventos: reaccionar a cada
      uno releería el historial una docena de veces por un solo commit.
      **(3)** Se usa la ruta que el propio repositorio declara, no `<worktree>/.git`, para
      que un worktree enlazado —donde `.git` es un archivo— también funcione.
      *Lo que no se invalida:* el diff de un commit y el contenido de un archivo, que sí
      son inmutables una vez escritos. Descartarlos en cada cambio releería trabajo que
      no pudo haber cambiado.
      *Dos respaldos, porque una vigilancia puede fallar* en un volumen de red o bajo un
      sandbox restrictivo: refresco al volver a la ventana, y un botón *Actualizar*
      explícito. Si la vigilancia no se establece, la ventana sigue funcionando.
      *Verificado:* 5 tests de Rust contra actividad real del sistema de archivos
      —incluido que un commit reporte **una sola vez** y que soltar el handle detenga la
      vigilancia— y 6 de interfaz, incluido que el diff **no** se invalide.
      → `feat(core): watch a repository for changes` · `feat(ipc): expose the repository watch` · `feat(ui): keep the open repository in step with the disk`

---

## 🔴 En progreso — Release v0.1.0

> Ejecutado con el skill `/release`. Ver `CLAUDE.md` para el procedimiento completo.

- [x] **R-1 — Auditar y decidir versión.** Sin tags previos en `main`; 61 commits en
      `dev` (24 `feat`, 12 `test`, 11 `docs`, 5 `chore`, 4 `fix`, 3 `ci`, 1 `refactor`,
      1 `perf`). Primera release, y la versión ya estaba fijada en el plan aprobado:
      **v0.1.0**.

- [x] **R-2 — CHANGELOG a `0.1.0`.** `[Unreleased]` renombrado a
      `## [0.1.0] — 2026-09-08`, con un `[Unreleased]` vacío arriba. Verificado que el
      `awk` de `release.yml` extrae las 16 viñetas de la sección.

- [x] **R-3 — Commit de release.** Último commit de `dev` antes del PR, con el
      CHANGELOG y el estado del README.
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

- **Fase 0 — Cimientos** (11/11, una de mantenimiento posterior). El esqueleto completo funciona antes de la primera línea
  de lógica de negocio: workspace Rust con la frontera del dominio aplicada por el
  compilador, TypeScript estricto con la frontera del graph-layout aplicada por ESLint,
  lints que deniegan `unwrap`/`expect`/`panic`, el pipeline de contratos tipados con su
  chequeo de drift, hook de pre-commit de 2 s, y los tres workflows de CI.
  **Cada frontera se verificó rompiéndola a propósito una vez.**
  *Verificación de cierre:* `cargo fmt --check` limpio · `cargo clippy --all-targets
  --all-features -- -D warnings` limpio · `cargo test --workspace` 3 tests en verde ·
  `bindings.ts` sin drift · typecheck, lint y format del frontend limpios.

- **Fase 2 — Layout del graph y render** (9/9). El núcleo de valor del proyecto: layout
  reanudable, render SVG sobre filas virtualizadas en un único contenedor de scroll, y
  paginación por cursor. Verificado contra ci4-website-suite hash por hash, y con
  p95 = 47,9 ms sobre 10.000 commits empaquetados.

- **Fase 1 — Motor de datos Git** (11/11, una de rendimiento). Validación canónica,
  historial paginado, refs, IPC y logging implementados y probados. Comparación real
  de 50 commits con `git log` sin diferencias. p95 del lector IPC de 19 ms con
  10.000 objetos sueltos y 2 ms empaquetados; primera lectura en frío de objetos
  sueltos de 376 ms, documentada sin confundirla con el p95.
  Evidencia y reproducción: [`docs/verification/phase-1.md`](docs/verification/phase-1.md).
