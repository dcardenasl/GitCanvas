# GitCanvas — snapshot

> Actualizado: 2026-10-12 · Ficha completa: [ASSET.md](ASSET.md)

## Retomar

| Campo | Estado |
|---|---|
| Etapa | v0.2.0 publicado: interfaz en inglés y español |
| H2 e I18N | Cerradas: H2 46/46 (38 con commit dedicado; H2-34–41 en `437ff07`) e I18N 6/6 |
| Release | v0.2.0 publicado el 2026-10-12 (PR [#9](https://github.com/dcardenasl/GitCanvas/pull/9), tag sobre `main`, instaladores de Linux, macOS y Windows) |
| Siguiente tarea | Planificar las secciones 2 y 4 del plan de tres funcionalidades |
| Fuente de trabajo | [`TASKS.md`](../TASKS.md), criterios detallados en el plan H2 |

El MVP incluye historial y graph, detalle/diffs, cambios locales, GitHub clone y
acciones Git guardadas. Durante la inspección GitCanvas no añade ni quita archivos del
index, no crea commits ni elimina archivos. Checkout, fast-forward pull y push sí
modifican estado Git de forma explícita. Pull no crea merges y push nunca fuerza.

## Estado del trabajo en curso

No hay tareas abiertas. `dev` y `main` están sincronizados en el merge de la PR #9. Las
secciones 2 (commits desde la interfaz) y 4 (pestañas, favoritos y persistencia) del plan de
tres funcionalidades no tienen tareas todavía; hay que planificarlas antes de implementarlas.

## Documentos

- [Plan de endurecimiento](plan/2026-10-04-plan-de-endurecimiento.md)
- [Plan de tres funcionalidades](plan/2026-10-08-plan-tres-funcionalidades.md)
- [Plan rector](plans/2026-09-08-plan-de-implementacion.md)
- [Contexto arquitectónico](../CONTEXT.md)
- [Decisiones de arquitectura](adr/)
- [Ficha del asset](ASSET.md)
