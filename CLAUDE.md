# CLAUDE.md — GitCanvas

Contexto para retomar este proyecto sin la conversación previa. Escrito para que
cualquier modelo o sesión nueva pueda continuar sin repetir decisiones ya cerradas.

## Qué es

Cliente Git visual estilo GitKraken, enfocado en el **graph de branches y commits**.
Tauri v2 + Rust (`git2`) para los datos, React/TypeScript para el layout del graph y
el render SVG. El graph es el núcleo de valor: todo lo demás está subordinado a él.

## Cómo retomar en frío

1. Leer [`TASKS.md`](TASKS.md) → primera tarea sin marcar. Ese es el punto de partida.
2. Leer la sección de esa fase en
   [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
   Trae las decisiones técnicas ya cerradas: no las vuelvas a abrir.
3. `git log --oneline | head -15` → copiar el estilo real del historial antes de
   escribir cualquier mensaje de commit.
4. `git branch --show-current` → tiene que decir `dev`. Si no, `git checkout dev`.

## Documentos de referencia

| Archivo | Qué contiene |
|---|---|
| `TASKS.md` | **Fuente de verdad de ejecución.** Qué falta, qué se hizo, qué se descubrió |
| `docs/plans/2026-09-08-plan-de-implementacion.md` | Plan rector: fases, deltas, ledger de commits |
| `docs/PLAN-DESARROLLO.md` | Plan de diseño original. El plan rector lo endurece en 10 puntos (D1–D10) |
| `docs/ASSET.md` | Ficha del asset y roadmap de producto |
| `docs/SNAPSHOT.md` | Estado de la última sesión |
| `docs/mockup.html` | Referencia visual de la UI. Abrir en el navegador |
| `ARCHITECTURE.md` | Decisiones de arquitectura del código (desde la Fase 0) |

## Reglas de trabajo

### Ramas

- **`main` nunca recibe commits directos.** Su único commit propio es el que la creó.
- **Todo el trabajo va a `dev`.**
- `main` solo cambia por merge de un PR `dev → main`, y ese PR solo lo abre el
  flujo de release.
- `dev` es permanente: nunca se borra después de un merge.

### Mensajes de commit — reglas del skill `/commit-flow`

Aplican **siempre**, se invoque el skill o no.

```bash
git commit -m "type(scope): subject in english"
```

**Una sola línea. Un solo `-m`. En inglés. Imperativo. Minúscula después de los dos
puntos. Sin punto final.** Tipos: `feat fix docs chore refactor test perf style ci build`.
El hook `commit-msg` valida el formato, el tipo permitido, el asunto de una sola línea
y la ausencia de trailers o menciones a Claude, AI o Anthropic.

Prohibido sin excepción:

| ❌ | Por qué |
|---|---|
| Cuerpo del mensaje, o cualquier texto tras la primera línea | Una línea, siempre |
| Cualquier trailer, `Co-Authored-By` incluido | Sin atribución de ningún tipo |
| Mencionar Claude, AI o Anthropic en cualquier parte | Ni en el subject, ni en un trailer, ni en el PR |
| Mensajes en español | El historial va en inglés |
| `--no-verify` | Los hooks detectan problemas reales; se arreglan, no se saltan |
| `--amend` después de que falle un hook | Se crea un commit nuevo |
| `git add .` o `git add -A` | Se nombran los archivos uno por uno |
| Subjects vagos: `fix bug`, `update code` | Qué cambió y dónde |

Nunca, sin confirmación explícita de David: `git reset --hard`, `git clean -fd`,
`git push --force`, `git checkout -- .`.

**Si un hook falla:** mostrar el error, arreglar la causa, y crear un commit nuevo.
Nunca revertir automáticamente con comandos destructivos.

### CHANGELOG

Solo para cambios que un usuario nota: `feat`, `fix`, `perf`. Se saltan `refactor`,
`test`, `chore`, `ci` y docs internos.

Se agrega bajo la versión no publicada que ya exista — **nunca se inventa un número de
versión nuevo**. Los bumps de versión ocurren solo en el release.

Formato del bullet, igual que en `ci4-website-suite`:

```
- **`NombreDeClase` o endpoint** — qué cambió y por qué importa. Una frase, concreta.
```

### Release — skill `/release`

Es la **única** forma en que este proyecto llega a `main`:

1. Auditar: último tag en `main`, `git log main..dev`, estado del CHANGELOG.
2. Versión por SemVer (`feat` → minor, resto → patch; breaking pre-1.0 → minor).
   **Confirmar con David antes de seguir.**
3. Renombrar `## [Unreleased]` a `## [X.Y.Z] — YYYY-MM-DD` y abrir un `[Unreleased]`
   vacío arriba.
4. `chore: release vX.Y.Z` como **último commit de `dev`**, y push.
5. `gh pr create --base main --head dev`. **Parar y esperar aprobación de David.**
6. `gh pr merge <N> --merge` — nunca `--squash` ni `--rebase`.
7. Tag `vX.Y.Z` **solo sobre `main`**, y push del tag.
8. `release.yml` crea el GitHub Release extrayendo la sección del CHANGELOG.
   **Nunca `gh release create` a mano.** Si falta la sección `## [X.Y.Z]`, el workflow
   falla — no taggear sin ella.

### Otros skills

- **`/auditoria-procesos`** — bitácora del proceso de ejecución con informe en
  `audits/`. Solo si David lo pide explícitamente. No se activa solo.
- **`/code-review`, `/security-review`** — puertas opcionales sobre el diff actual.
  Útiles antes del PR de release; no son parte del flujo obligatorio.

## Reglas técnicas que no se negocian

Cada una está hecha para fallar el build, no para depender de que alguien se acuerde.

1. **`crates/gitcanvas-core` no depende de `tauri`.** Un `use tauri::…` ahí dentro no
   compila. Ese crate es el dominio git puro.
2. **Cero `unwrap`, `expect`, `panic!` e indexación cruda en código de producción
   Rust.** Está denegado a nivel de crate por clippy. Todo error se modela en
   `AppError` y se propaga como `Result`.
3. **Cero `any` en TypeScript**, `strict` + `noUncheckedIndexedAccess` +
   `exactOptionalPropertyTypes` desde el primer commit.
4. **`src/bindings.ts` es generado. Nunca se edita a mano.** Lo produce
   `tauri-specta` desde los tipos de Rust; CI lo regenera y falla si difiere.
5. **`src/lib/graph-layout/` no importa nada de `components/`, `state/`, `bindings.ts`
   ni del DOM.** ESLint lo prohíbe y sus tests corren en `environment: 'node'`.
6. **Todo comando que toca `git2` corre en `tauri::async_runtime::spawn_blocking`.**
   `git2` es bloqueante; sin esto un repo grande congela la UI.
7. **El estado nunca guarda un `git2::Repository` vivo.** `AllowedRepos` conserva solo
   paths canónicos autorizados por `open_repository`, el arranque o clone. Los comandos
   que operan sobre un repo pasan por `with_repo`, que exige allowlist y construye un
   `ActiveRepo` nuevo para abrir su propio handle.
8. **Paginación acotada, con cursor ligado a la revisión que lo emitió.** La historia usa
   SHA + roots congelados; los cambios locales, `revisión:posición`, y rechazan un cursor
   de otra revisión (`StaleCursor`). Solo el árbol de un commit, que es inmutable, pagina
   por offset. Máximo 500 commits por página.
9. **El layout del graph es reanudable.** Cargar la página N+1 no puede reordenar los
   carriles de las páginas anteriores.
10. **El PAT entra por IPC una sola vez**, como argumento de
    `store_github_token`; Rust lo recorta, verifica y guarda en el keychain del SO. El
    backend nunca lo devuelve: las llamadas REST y el callback de `git2` lo leen dentro
    de Rust. Nunca se escribe en un archivo plano.

## Convenciones de código

- **Idioma:** la conversación con David es en español. **Código, comentarios, mensajes
  de commit, CHANGELOG y docs técnicos del repo van en inglés.** `TASKS.md` y `docs/`
  son la excepción: español.
- **Idioma de la interfaz:** todo texto que ve el usuario va en español. Los mensajes de
  error del backend son diagnósticos en inglés y se muestran detrás de un resumen en
  español por tipo de error (`src/lib/errors.ts`, `userMessage`); nunca se pintan crudos.
  Los errores que el código lanza para sí mismo (`throw new Error(…)`) van en inglés.
- **Indentación** (de `~/Developer/AGENTS.md`): 4 espacios en Rust, 2 en JS/TS.
- **Nombres:** `PascalCase` clases y componentes, `camelCase` variables y funciones,
  `kebab-case` archivos web.
- Funciones públicas documentadas: rustdoc en Rust, TSDoc en TypeScript.
- Sin `TODO` sueltos: si algo queda pendiente, va como tarea en `TASKS.md`.

## Verificación

**Pre-commit (local, instantáneo):** `cargo fmt --check`, `eslint`, `prettier --check`.

**Push a `dev` (CI ligero, ubuntu):** typecheck, lint, `vitest run`,
`cargo test -p gitcanvas-core`.

**PR `dev → main` (la puerta real, matriz ubuntu/macos/windows):** `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings`, `cargo test`, `vitest run --coverage`
contra los umbrales (90% en `graph-layout`), regeneración de `bindings.ts` +
`git diff --exit-code`, `tauri build`, y E2E en ubuntu.

**`dev` es rápido, el PR a `main` es la puerta.** No agregues checks pesados al hook de
pre-commit ni al workflow de push: la decisión ya está tomada y explicada.

## Repos de referencia en esta máquina

Leer, nunca modificar:

- `~/Developer/PHP/ci4-website-starter/ci4-website-suite` — modelo de `release.yml`,
  del instalador de hooks, del formato del CHANGELOG y del estilo de `TASKS.md`.
- `~/Developer/PHP/ci4-platform/ci4-admin-starter` — el otro repo que GitCanvas tiene
  que saber abrir y dibujar.
- `~/Developer/AGENTS.md` — convenciones del workspace completo.
