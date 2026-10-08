# GitCanvas: Plan de Desarrollo Detallado

> Plan de ejecución técnica completo del MVP. Cada fase incluye decisiones de arquitectura ya tomadas (no "a definir durante la implementación"), criterios de aceptación verificables y las medidas concretas para que nada de esto se convierta en deuda técnica más adelante.

> **Estado 2026-09-11:** las fases del MVP están implementadas. La funcionalidad
> de cambios locales se mantiene con el contrato final de `WorktreeSnapshot`,
> detalles bajo demanda, límites de recursos, rutas confinadas, watcher con
> generaciones y fallback por fingerprint. Este documento queda como guía de
> mantenimiento y validación, no como descripción de módulos todavía inexistentes.

---

## 0. Principios rectores

Estas reglas aplican a las seis fases sin excepción. Son la forma concreta de cumplir "sin deuda técnica, mantenible, escalable, predecible":

1. **Contratos antes que código.** Los tipos de datos que cruzan la frontera Rust/TypeScript se definen primero y se generan automáticamente desde Rust (con el crate `specta`), nunca se escriben a mano en los dos lados. Escribir el mismo tipo dos veces es la fuente número uno de bugs silenciosos en apps Tauri: el día que cambias un campo en Rust y olvidas actualizar TypeScript, el compilador no te avisa. Con generación automática, sí.
2. **Cero `unwrap()`/`expect()`/`panic!()` en código de producción Rust.** Todo error se modela con un enum tipado (`thiserror`) y se propaga como `Result`. Un panic en un comando Tauri tira la app entera; no es aceptable en una herramienta que se supone confiable.
3. **Cero `any` en TypeScript, `strict: true` desde el primer commit.** Activar strict mode después de tener código escrito es mucho más caro que empezar con él.
4. **El algoritmo de layout del graph es una función pura, sin dependencias de React, DOM ni Tauri.** Es la pieza más importante del proyecto (es el valor central del producto) y la más fácil de romper sin darte cuenta si vive mezclada con código de UI. Vive aislada, se testea aislada.
5. **Cada fase cierra con una checklist de "Definición de hecho"** (ver sección 8), no con "funciona en mi máquina".
6. **CI bloquea cualquier cambio que no pase lint, tipos y tests**, incluso trabajando solo. La disciplina de un pipeline que no perdona es lo que evita que "después lo arreglo" se acumule silenciosamente.
7. **Versionado semántico estricto desde v0.1.0**, con entrada obligatoria en `HISTORIAL.md` por cada release, sin excepción.

---

## 1. Estructura del proyecto

```
gitcanvas/
├── src-tauri/                        → Backend Rust
│   ├── src/
│   │   ├── main.rs                   → Entry point, registro de comandos
│   │   ├── commands/                 → Frontera IPC: un archivo por dominio
│   │   │   ├── repository.rs         → open_repository, validate_repository
│   │   │   ├── history.rs            → get_commits (paginado)
│   │   │   ├── refs.rs               → get_branches, get_tags
│   │   │   ├── diff.rs               → get_commit_diff
│   │   │   ├── github.rs             → list_github_repos, clone_repository
│   │   │   └── actions.rs            → checkout_branch, pull, push
│   │   ├── git/                      → Lógica de dominio, sin saber que existe Tauri
│   │   │   ├── repository.rs         → apertura y validación de repos
│   │   │   ├── history.rs            → revwalk + paginación
│   │   │   ├── refs.rs               → resolución de branches/tags
│   │   │   └── diff.rs               → cálculo de diffs
│   │   ├── github/                   → Cliente API GitHub + manejo de tokens
│   │   ├── error.rs                  → AppError central, un solo lugar
│   │   └── state.rs                  → Estado compartido de la app (Tauri State)
│   ├── tests/                        → Tests de integración (repos temporales reales)
│   └── Cargo.toml
├── src/                               → Frontend React + TypeScript
│   ├── bindings.ts                   → GENERADO por specta, nunca editar a mano
│   ├── lib/
│   │   ├── graph-layout/             → El algoritmo. Cero imports de React aquí.
│   │   │   ├── layout.ts
│   │   │   ├── layout.test.ts
│   │   │   ├── colors.ts
│   │   │   └── types.ts
│   │   └── ipc/                      → Wrappers tipados sobre bindings.ts
│   ├── components/
│   │   ├── GraphCanvas/              → Render SVG del graph, consume layout.ts
│   │   ├── CommitTable/
│   │   ├── CommitDetailPanel/
│   │   └── DiffViewer/
│   ├── state/                        → React Query (server state) + Zustand (UI state)
│   └── App.tsx
├── .github/workflows/ci.yml
└── package.json
```

**Regla de dependencia dura:** `lib/graph-layout/` no importa nada de `components/`. Se puede correr sus tests con `vitest` sin levantar un solo componente de React. Si en algún momento algo ahí necesita `window` o `document`, es una señal de que la responsabilidad está mal ubicada.

---

## 2. Contratos de datos compartidos (Rust ↔ TypeScript)

Se generan con `specta` (`#[derive(serde::Serialize, specta::Type)]` sobre los structs de Rust, exportados a `src/bindings.ts` en cada build). Los tipos núcleo, ya definidos:

```rust
// src-tauri/src/git/history.rs (forma final, no borrador)
pub struct CommitInfo {
    pub id: String,           // SHA completo
    pub short_id: String,     // SHA corto, para mostrar
    pub summary: String,      // primera línea del mensaje
    pub message: String,      // mensaje completo
    pub author_name: String,
    pub author_email: String,
    pub authored_at: i64,     // unix timestamp, la conversión a fecha local es responsabilidad del frontend
    pub parent_ids: Vec<String>,
    pub refs: Vec<RefInfo>,   // branches/tags que apuntan a este commit
}

pub struct RefInfo {
    pub name: String,
    pub kind: RefKind,        // LocalBranch | RemoteBranch | Tag
    pub is_head: bool,
}

pub struct CommitPage {
    pub commits: Vec<CommitInfo>,
    pub next_cursor: Option<String>,  // paginación basada en cursor, nunca offset numérico
    pub total_estimate: Option<u32>,  // estimado, no exacto (contar todo el historial es caro)
}
```

```rust
// src-tauri/src/error.rs
#[derive(thiserror::Error, Debug, serde::Serialize, specta::Type)]
pub enum AppError {
    #[error("no se encontró un repositorio git en esta ruta")]
    NotAGitRepository,
    #[error("no se pudo acceder a la ruta: {0}")]
    PathAccess(String),
    #[error("error de git: {0}")]
    Git(String),              // mensaje de git2::Error convertido, nunca el objeto crudo
    #[error("error de red al comunicarse con GitHub: {0}")]
    GitHubNetwork(String),
    #[error("credenciales inválidas o expiradas")]
    InvalidCredentials,
    #[error("error interno: {0}")]
    Internal(String),
}
```

**Por qué paginación por cursor y no por offset:** un repositorio puede crecer o tener commits reordenados entre una llamada y otra (poco probable pero no imposible si el usuario hace fetch en paralelo); un cursor basado en el SHA del último commit visto es estable ante eso. Un offset numérico no lo es y produce bugs intermitentes difíciles de reproducir, exactamente el tipo de problema que "predecible" busca evitar.

---

## 3. Fases

### Fase 0: Cimientos del proyecto

**Objetivo:** que el esqueleto completo (build, lint, tests, CI) funcione antes de escribir una sola línea de lógica de negocio.

**Tareas:**
1. Instalar Rust (`rustup`) y Tauri CLI; scaffold con `npm create tauri-app@latest` (template React + TypeScript).
2. Configurar `tsconfig.json` con `strict: true`, `noUncheckedIndexedAccess: true`.
3. Configurar ESLint + Prettier (reglas que prohíban `any` explícito) y Rustfmt + Clippy (`clippy::all` y `clippy::pedantic` como warnings, con `-D warnings` en CI para que no se puedan ignorar).
4. Agregar `specta` al `Cargo.toml` y generar el primer `bindings.ts` a partir de un comando trivial, para validar que el pipeline de generación de tipos funciona de punta a punta antes de depender de él para todo lo demás.
5. Configurar GitHub Actions: matriz `ubuntu-latest` / `macos-latest` / `windows-latest`, con cache de `cargo` y `npm`, ejecutando fmt, clippy, typecheck, lint, tests y build en cada push.
6. Crear un comando `ping` de prueba (Rust devuelve versión de la app) para probar el roundtrip Tauri IPC completo, con su test.

**Criterios de aceptación:**
- `cargo clippy --all-targets -- -D warnings` pasa limpio.
- `npm run typecheck` y `npm run lint` pasan limpio.
- CI verde en los tres sistemas operativos.
- La ventana abre vacía, el comando `ping` hace roundtrip Rust → TypeScript y se ve en la consola del frontend.

---

### Fase 1: Motor de datos Git (Rust)

**Objetivo:** dado un path local, obtener commits, branches y tags de forma correcta, predecible y sin bloquear la UI, sin importar el tamaño del repositorio.

**Decisiones técnicas:**

- **`git2` con la feature `vendored-libgit2`**, no la versión del sistema operativo. Compilar libgit2 desde el propio crate evita que el build dependa de qué versión de libgit2 esté instalada en cada máquina (la tuya, la de CI, la de quien sea que use la app después). Esto es concretamente lo que evita el riesgo "libgit2 requiere compilación nativa por SO" de forma definitiva, no parcial.
- **El estado de la app nunca guarda un `git2::Repository` vivo entre comandos.** `git2::Repository` no es `Send`/`Sync` de forma segura para compartir entre hilos, y forzarlo con locks introduce complejidad y puntos de contención innecesarios. En su lugar, el estado de la app (`state.rs`) guarda solo el **path canónico validado** del repositorio activo; cada comando abre su propio handle de `git2::Repository` al momento de ejecutarse. Abrir un repo es una operación barata (lectura de refs, no de todo el historial), así que esto no cuesta performance real y elimina una categoría entera de bugs de concurrencia antes de que existan.
- **Todo comando que toca `git2` corre dentro de `tauri::async_runtime::spawn_blocking`.** `git2` es bloqueante (I/O de disco síncrono); el runtime de Tauri es async sobre tokio. Sin `spawn_blocking`, un repositorio grande congela la UI completa mientras se procesa. Esto no es opcional para cumplir "predecible".
- **Revwalk con `Sort::TOPOLOGICAL | Sort::TIME`**, para que el orden de commits coincida con lo que se espera visualmente (como `git log --graph`).
- **Paginación por cursor desde el día uno** (no "lo agregamos después si hace falta"): cada llamada a `get_commits` recibe un cursor opcional y devuelve un `CommitPage` con como máximo 500 commits y el cursor siguiente. Cargar un historial de 100.000 commits de una sola vez no es escalable ni predecible en tiempo de respuesta; diseñar para eso desde el principio evita una reescritura después.
- **Validación de paths:** todo path recibido del frontend se canonicaliza (`std::fs::canonicalize`) y se verifica que exista y contenga un `.git` antes de usarse, para evitar tanto errores confusos como problemas de path traversal si en el futuro el path viene de una fuente menos confiable (por ejemplo, un valor restaurado de una sesión guardada).

**Testing:**
- Fixtures de repos temporales creados programáticamente con la propia API de `git2` (no repos `.git` versionados en el proyecto, que son frágiles y difíciles de razonar). Cada test crea un directorio temporal, inicializa un repo, crea commits y branches con una estructura conocida, y verifica que `CommitInfo`/`RefInfo` devueltos coincidan exactamente con lo esperado.
- Casos cubiertos: historial lineal simple, un merge, branches divergentes, tags, HEAD desprendido.

**Criterios de aceptación:**
- Abrir cualquiera de los repos reales (ci4-website-suite, ci4-admin-starter) y listar la primera página de commits coincide, commit por commit, con la salida de `git log`.
- p95 de latencia de la primera página de commits por debajo de 300ms en un repo de hasta 10.000 commits.
- Ningún `unwrap`/`expect`/`panic!` en el código de `src-tauri/src/git/` ni `src-tauri/src/commands/`.

---

### Fase 2: Layout del graph + render (núcleo del valor)

Esta es la fase que más cuidado necesita, porque es la razón de ser del proyecto.

**El algoritmo de layout (TypeScript puro, sin React):**

Entrada: la lista de commits ya paginada y ordenada (de Fase 1). Salida: para cada commit, en qué "carril" (columna) se dibuja y cómo se conectan sus líneas con sus padres.

Funcionamiento, paso a paso:
1. Se mantiene un arreglo de "carriles activos": qué commit está actualmente ocupando cada columna visual, a medida que se recorre la lista de arriba hacia abajo (del commit más nuevo al más viejo).
2. Para cada commit: si ya tiene un carril reservado (porque un hijo suyo, procesado antes, lo reservó), usa ese carril. Si no tiene ninguno (es la punta de una branch que recién aparece), se le asigna el primer carril libre.
3. El primer padre del commit **continúa en el mismo carril** (así se preserva visualmente la idea de "línea principal de la branch", igual que la convención de git de que el primer padre es la continuación natural).
4. Padres adicionales (commits de merge) reservan un carril propio si no tenían uno ya, o reutilizan el que tenían.
5. Cuando la línea de un carril termina (llegó a un commit sin más commits por dibujar debajo, o a la punta que no tiene más historia cargada en la página actual), ese carril se libera y puede ser reutilizado por la siguiente branch nueva que aparezca, para que el ancho del graph no crezca sin límite.
6. Color: **función determinística del número de carril** (no aleatoria), ciclando sobre una paleta fija de colores accesibles. Esto evita que los colores "parpadeen" o cambien entre un render y otro, algo que rompería la sensación de predictibilidad del graph.

Casos borde explícitamente diseñados, no descubiertos en producción:
- Merges de más de dos padres (octopus merge).
- Commit inicial sin padres.
- El límite de una página cargada: si un commit todavía tiene padres que no están en la página actual, se dibuja un indicador visual de "continúa" en vez de asumir que la línea termina ahí.

**Render:**
- Componente `GraphCanvas`, SVG puro: círculos para los nodos, curvas Bézier para las líneas que cambian de carril (en merges o aperturas de branch), líneas rectas para el mismo carril.
- **Virtualización de filas** sincronizada con el scroll de la tabla de commits (usando `@tanstack/react-virtual`): solo se renderizan las filas visibles más un margen, nunca las miles de filas completas del historial cargado. Como ninguna línea del graph cruza más de una fila sin pasar por un nodo, renderizar por ventana de filas es seguro y no corta líneas a la mitad.

**Testing:**
- El módulo `graph-layout/` se testea con fixtures de grafos de commit construidos a mano: historial lineal, un merge simple, dos branches paralelas, un octopus merge. Se verifica la asignación exacta de carril y color esperada para cada commit, no solo "que no explote".
- Cobertura mínima exigida en CI para este módulo específico: 90%, más alta que el resto del proyecto, porque es la pieza que más valor concentra y la más difícil de verificar solo mirando la pantalla.

**Criterios de aceptación:**
- El historial real de ci4-website-suite (con el merge visible en la captura de referencia) se dibuja sin cruces de líneas innecesarios.
- Scroll fluido (60fps sostenido) con hasta 12 carriles activos simultáneos y miles de commits cargados.

---

### Fase 3: Panel de detalle de commit + diff

**Decisiones técnicas:**
- El diff se calcula, para el MVP, **contra el primer padre únicamente** (no diff combinado para merges). Esto se documenta explícitamente como limitación conocida en vez de intentar resolver diff combinado de entrada, que es un problema bastante más complejo y no es indispensable para el valor central del producto.
- Para el render del diff, se usa una librería ya madura y testeada (`react-diff-view` o equivalente) en vez de construir un visor de diffs desde cero. Un visor de diffs "a medias" es exactamente el tipo de deuda técnica silenciosa que este plan busca evitar: parece simple hasta que aparecen encodings raros, archivos sin salto de línea final, o diffs de miles de líneas.
- **Guard de archivos binarios y de diffs muy grandes:** archivos binarios detectados por `git2` se muestran con un placeholder, nunca se intenta renderizar su "diff". Diffs de más de un umbral de líneas (por ejemplo 2000) se cargan bajo demanda con un botón "ver diff completo", para que un archivo generado enorme no cuelgue el render.

**Criterios de aceptación:**
- Seleccionar cualquier commit muestra su lista de archivos modificados y el diff línea por línea coincide con `git show`.
- Un archivo binario o un diff gigante no bloquea ni ralentiza perceptiblemente la UI.

---

### Fase 4: Integración con GitHub

**Decisiones técnicas:**
- **Nunca clonar en modo shallow.** Un clone truncado (`--depth`) corta el historial, y como el graph completo es el valor central del producto, un historial incompleto sería visualmente engañoso, contradice el objetivo del proyecto. Se hace clone completo a un directorio de caché propio de la app (bajo el directorio de datos de la aplicación, no en una carpeta del usuario), con progreso reportado al frontend vía un evento Tauri (`clone_progress`) para que la espera en repos grandes sea visible y no parezca que la app se colgó.
- **Tokens de GitHub nunca en texto plano ni en `localStorage`.** Se almacenan en el keychain nativo del sistema operativo, a través de un plugin de Tauri para almacenamiento seguro (Stronghold o el plugin de keychain del SO). Esto no es negociable: es la diferencia entre una app confiable y una que filtra credenciales si alguien accede al disco.
- La API REST de GitHub se usa **solo** para dos cosas: validar el token y listar los repositorios accesibles para que el usuario elija cuál abrir. Toda la data del graph en sí (commits, branches) sale siempre del clone local vía `git2`, exactamente como se decidió en la sesión de diseño: un solo camino de datos, no dos.
- **Política de retención de la caché de clones:** para que el disco no crezca sin control, se define un límite (por defecto, 10 repositorios o 5GB, lo que se cumpla primero) con expulsión del menos usado recientemente (LRU) cuando se supera.

**Criterios de aceptación:**
- Pegar la URL de un repo público de GitHub lo clona y muestra su graph completo.
- Un repo privado se lista y se clona correctamente usando un Personal Access Token guardado de forma segura, verificable con una inspección del almacenamiento del sistema (no debe aparecer el token en ningún archivo plano de la app).

---

### Fase 5: Acciones básicas (checkout, pull, push)

**Decisiones técnicas:**
- **Checkout seguro por defecto:** si el working tree tiene cambios sin commitear que se perderían, la operación se bloquea y se informa el conflicto en vez de forzar silenciosamente. Forzar requiere una confirmación explícita del usuario.
- **Pull limitado a fast-forward para el MVP.** Crear automáticamente un commit de merge desde una acción de UI tiene implicancias de UX y de corrección que ameritan resolverse con más cuidado; para el MVP, si un pull no puede resolverse como fast-forward, se informa y se deja la decisión al usuario (por ahora, desde la línea de comandos).
- **Push reutiliza la infraestructura de credenciales de la Fase 4.** Fallos de autenticación se muestran de forma clara, nunca como un error genérico.
- Cualquier acción potencialmente destructiva (checkout forzado, push) requiere confirmación explícita en la UI, sin excepción.

**Criterios de aceptación:**
- Checkout de una branch con working tree limpio funciona sin fricción; con cambios sin commitear, se bloquea con un mensaje claro.
- Pull fast-forward funciona; un caso que requiera merge se informa correctamente sin intentar resolverlo automáticamente.

---

## 4. Estrategia de testing (pirámide completa)

| Nivel | Qué cubre | Herramienta |
|---|---|---|
| Unitario | Algoritmo de layout (TS), funciones de `git/` (Rust) | Vitest, `cargo test` |
| Integración | Comandos Tauri completos contra repos temporales reales | `cargo test` con fixtures de `git2` |
| End-to-end | Flujo crítico: abrir repo → ver graph → click en commit → ver diff | `tauri-driver` + WebDriver |

El módulo de layout tiene el listón de cobertura más alto (90%) de todo el proyecto, porque es la parte más difícil de verificar solo mirando la pantalla y la que más valor concentra.

---

## 5. CI/CD

En cada push: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `npm run typecheck`, `npm run lint`, `npm run test`, build de `tauri build` en matriz Ubuntu/macOS/Windows. Sin excepción para mergear a la rama principal, incluso trabajando solo: la disciplina de un pipeline que no perdona es lo que evita que la deuda técnica se acumule silenciosamente con el tiempo.

Releases disparados por tag, generando instaladores por sistema operativo. La firma de código (code signing) se deja fuera del MVP pero el pipeline se estructura para agregarla después sin necesidad de reescribir el flujo.

---

## 6. Observabilidad y manejo de errores

- Rust: logging estructurado con el crate `tracing`, escrito a un archivo rotativo en el directorio de datos de la app, accesible desde un ítem de menú "Ver logs" para poder diagnosticar problemas sin necesitar reproducir el bug en vivo.
- Frontend: los errores que vienen de comandos Tauri se capturan de forma centralizada y se muestran como notificaciones claras al usuario, nunca como un stack trace crudo; el detalle técnico completo va al archivo de log, no a la pantalla.

---

## 7. Riesgos técnicos identificados y su mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El algoritmo de layout no se ve prolijo con muchas ramas paralelas activas al mismo tiempo | Medio | Aceptado explícitamente: se optimiza para el caso común, no para el caso patológico (decisión ya tomada en la sesión de diseño) |
| `git2`/libgit2 requiere compilación nativa por sistema operativo | Medio | Resuelto con la feature `vendored-libgit2`, sin depender de librerías del sistema del build |
| Diffs de archivos binarios o muy grandes cuelgan el render | Medio | Guard explícito en Fase 3: detección de binario y límite de líneas con carga bajo demanda |
| Manejo incorrecto de tokens de GitHub expone credenciales | Alto | Almacenamiento obligatorio en keychain nativo del SO, nunca archivo plano |
| Crecimiento sin control de la caché de repos clonados | Bajo | Política de retención LRU definida en Fase 4 |
| Cargar el historial completo de un repo enorme de una sola vez | Alto | Paginación por cursor diseñada desde la Fase 1, no agregada después |

---

## 8. Definición de "hecho" por fase

Ninguna fase se considera cerrada hasta cumplir todo esto:
- [ ] Tests (unitarios e integración correspondientes a la fase) pasando en CI.
- [ ] `cargo clippy` y `eslint` sin warnings nuevos.
- [ ] Ningún tipo duplicado a mano entre Rust y TypeScript (verificado contra `bindings.ts` generado).
- [ ] Funciones públicas documentadas (rustdoc en Rust, TSDoc en TypeScript).
- [ ] Entrada agregada a `HISTORIAL.md` del asset.
- [ ] Sin comentarios `TODO` sueltos sin un ítem correspondiente en el roadmap de `ASSET.md`.

---

## 9. Métricas de éxito concretas (performance budget)

- Apertura de un repositorio de hasta 10.000 commits: primera página de datos visible en menos de 300ms.
- Scroll del graph: 60fps sostenido con hasta 12 carriles activos simultáneos.
- Caché de repos clonados de GitHub: no supera 5GB o 10 repositorios (lo que se cumpla primero) sin intervención manual.

---

*VentureOS · Plan creado: 2026-09-08*
