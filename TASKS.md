# TASKS — GitCanvas

> Fuente de verdad para el trabajo pendiente. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Tareas completadas, con su evidencia: [`ARCHIVES.md`](ARCHIVES.md).
> Planes: [endurecimiento H2](docs/plan/2026-10-04-plan-de-endurecimiento.md),
> [tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md) y el
> [plan general](docs/plans/2026-09-08-plan-de-implementacion.md).

**Estado al 2026-10-13:** v0.2.0 está publicado (tag sobre `main`, instaladores de Linux, macOS
y Windows), con la interfaz en inglés y español. La fase H2 (46 de 46) y la de
internacionalización (6 de 6) están cerradas y archivadas. La serie de auditoría posterior a v0.2.0 (8 de 8) está cerrada y archivada; las
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

Vacía.

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
