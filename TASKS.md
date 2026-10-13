# TASKS — GitCanvas

> Fuente de verdad para el trabajo pendiente. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Tareas completadas, con su evidencia: [`ARCHIVES.md`](ARCHIVES.md).
> Planes: [endurecimiento H2](docs/plan/2026-10-04-plan-de-endurecimiento.md),
> [tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md) y el
> [plan general](docs/plans/2026-09-08-plan-de-implementacion.md).

**Estado al 2026-10-12:** v0.2.0 está publicado (tag sobre `main`, instaladores de Linux, macOS
y Windows), con la interfaz en inglés y español. La fase H2 (46 de 46) y la de
internacionalización (6 de 6) están cerradas y archivadas. Hay abierta una serie de auditoría (AUD-3 a AUD-8); además las
secciones 2 (commits desde la interfaz) y 4 (pestañas, favoritos y persistencia) del plan de
tres funcionalidades todavía no tienen tareas.

**Estado del checkout:** `dev` y `main` están sincronizados en el merge de la
[PR #9](https://github.com/dcardenasl/GitCanvas/pull/9). Antes de editar, inspeccionar
`git status` y el historial.

## Siguiente paso

Planificar las secciones 2 y 4 del plan de tres funcionalidades y convertirlas en tareas aquí
antes de implementarlas. El orden de entrega del plan es: fundamentos de workspace y
persistencia, internacionalización (hecha), pestañas y favoritos, preparación y commits.

## Cola de trabajo

### Auditoría posterior a v0.2.0

Origen: auditoría del 2026-10-13 sobre los commits `a1e0f1f`, `4bf72e9` y `4bf6cd3`.

- [x] **AUD-1 — Versionar el plan de tres funcionalidades.** TASKS, ARCHIVES y SNAPSHOT lo
      enlazan; sin versionar, el enlace se rompía al clonar.
      → `docs(plan): add the three-feature plan referenced by tasks and archives` (`cd73b71`)

- [x] **AUD-2 — Sacar la salida de la revisión de diseño del repositorio.** `.impeccable/`
      es salida de herramienta con rutas de otra máquina; pasa a `.gitignore`.
      → `chore: stop tracking design review output` (`457cb66`)

- [x] **AUD-3 — Alinear dependencias con el runtime.** `@types/node` en la mayor del Node
      de `engines` y CI (22), `@types/hast` declarado (se importa directo), `@wdio/*` en una
      sola mayor y Dependabot agrupado para que no vuelvan a separarse.
      *Hallazgo durante la ejecución:* `@wdio/tauri-service` (1.4.0 y 1.5.0) exige
      `webdriverio ^9`, así que la v10 de `@wdio/mocha-framework` era la incompatible y el
      conjunto vuelve a la v9. `npm audit` completo marca `basic-ftp` en la cadena de
      desarrollo de wdio 9; es una herramienta de pruebas que no se distribuye y la puerta
      de CI audita solo producción.
      → `build(deps): align node types and webdriverio majors with the runtime`

- [x] **AUD-4 — Un registro de lenguajes y un resaltador sin restos.** Registro único de
      lenguajes cuyo tipo se deriva de él; gramáticas como `Record` exhaustivo (agregar un
      lenguaje sin gramática no compila); tabla de categorías en lugar de `includes`;
      `kind` tipado con `DiffLine["kind"]`; sin bandera mutable ni rama inerte. Prueba de que
      cada categoría tiene regla de visor y color en ambos temas.
      *Hallazgo durante la ejecución:* `import x from "./a.css?raw"` devuelve una cadena vacía
      en Vitest, así que `logical-css.test.ts` pasaba sin comprobar nada. Se reemplaza por
      `readStylesheet` (lectura de disco que falla si el archivo está vacío); el contenido real
      cumple la regla de propiedades lógicas.
      → `refactor(syntax): derive languages from one registry and type the highlighter`

- [x] **AUD-5 — Resaltar fuera del hilo de la interfaz.** Web Worker clásico con protocolo
      por identificador, cliente con cancelación y recuperación ante fallo, y el hook
      `useSyntaxHighlight` que reemplaza la lógica incrustada en `LineTable`, que recibe un
      único `highlight` en lugar de `path` y `mode` sueltos.
      *Hallazgo durante la ejecución:* en el navegador el worker lanzaba `document is not
      defined`: `decode-named-character-reference` (dependencia de `refractor`) resuelve a una
      entrada con DOM para la condición `browser` y Vite la prefiere a la `worker`. Los tests
      no pueden verlo (sin `Worker`), así que `vite.config.ts` la redirige a la entrada de
      JavaScript puro y un E2E comprueba que aparecen tokens en la aplicación empaquetada
      (pasa en WKWebView con la CSP de producción).
      → `perf(diff): run syntax highlighting in a worker behind a dedicated hook`

- [ ] **AUD-6 — Logos del tamaño que se muestran.** Exportes a resolución útil (hasta 4x),
      `BrandLogo` decide el `alt` y el nombre de marca deja de repetirse.
      → `perf(branding): ship logos at display resolution and own the alt text`

- [ ] **AUD-7 — Documentar la decisión.** ADR 0005, ARCHITECTURE y DESIGN (tokens
      `--syntax-*`, lenguajes soportados y cómo agregar uno).
      → `docs(syntax): record highlighting decisions in adr 0005`

- [ ] **AUD-8 — CHANGELOG con el formato del proyecto.**
      → `docs(changelog): name the components in unreleased entries`

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
