# TASKS — GitCanvas

> Fuente de verdad de ejecución. El plan rector está en
> [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones de trabajo y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).

**Estado:** Fase 4 · 51/67 tareas · última actualización 2026-09-08

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

## 🔴 En progreso — Fase 4: Integración con GitHub

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
