# GitCanvas — snapshot

> Actualizado: 2026-10-05 · Ficha completa: [ASSET.md](ASSET.md)

## Retomar

| Campo | Estado |
|---|---|
| Etapa | MVP implementado; endurecimiento H2 en curso |
| H2 | 43/46 implementadas y archivadas; 34 cierres con commit; H2-34–41 y H2-43 requieren reconciliar commits |
| Release | PR [#1](https://github.com/dcardenasl/gitcanvas/pull/1) abierta en SHA `7f24bb6`; el checkout `dev` tiene commits y cambios locales posteriores que la PR aún no evalúa. Los checks visibles son de 2026-09-26 y fallaron antes de ejecutar pasos; aprobación/merge y R-5/R-6 pendientes |
| Siguiente tarea | H2-25: confirmar arranque y E2E en Linux, macOS y Windows |
| Fuente de trabajo | [`TASKS.md`](../TASKS.md), criterios detallados en el plan H2 |

El MVP incluye historial y graph, detalle/diffs, cambios locales, GitHub clone y
acciones Git guardadas. Durante la inspección GitCanvas no añade ni quita archivos del
index, no crea commits ni elimina archivos. Checkout, fast-forward pull y push sí
modifican estado Git de forma explícita. Pull no crea merges y push nunca fuerza.

## Estado del trabajo en curso

El checkout compartido contiene cambios de varias tareas H2. Antes de editar, inspeccionar
`git status`, revisar el criterio de la tarea activa y confirmar qué cambios pertenecen a
ella. No archivar una tarea hasta que su implementación y evidencia requerida estén
completas. La suite E2E pasó en macOS local (4 specs/8 tests); aún falta evidencia de CI
Linux/macOS/Windows para los cambios actuales. No declarar verde lo que no se haya ejecutado
sobre el código vigente.

`ARCHIVES.md` declara H2-34–H2-41 y H2-43 completadas, pero esas entradas no tienen
commits dedicados; sus cambios siguen en el working tree. H2-33 sí está reconciliada con
`03077dd`. H2-45 está abierta para reconciliar la divergencia con la convención de un
commit por tarea.

## Documentos

- [Plan de endurecimiento](plan/2026-10-04-plan-de-endurecimiento.md)
- [Plan rector](plans/2026-09-08-plan-de-implementacion.md)
- [Contexto arquitectónico](../CONTEXT.md)
- [Decisiones de arquitectura](adr/)
- [Ficha del asset](ASSET.md)
