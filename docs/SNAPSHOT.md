# GitCanvas — snapshot

> Actualizado: 2026-10-14 · Ficha completa: [ASSET.md](ASSET.md)

## Retomar

| Campo | Estado |
|---|---|
| Etapa | v0.2.0 publicado: interfaz en inglés y español |
| H2 e I18N | Cerradas: H2 46/46 (38 con commit dedicado; H2-34–41 en `437ff07`) e I18N 6/6 |
| Release | v0.2.0 publicado el 2026-10-12 (PR [#9](https://github.com/dcardenasl/GitCanvas/pull/9), tag sobre `main`, instaladores de Linux, macOS y Windows) |
| Siguiente tarea | Verificación externa de WS-17; publicación fuera del alcance autorizado |
| Fuente de trabajo | [`TASKS.md`](../TASKS.md), criterios detallados en el plan H2 |

El MVP incluye historial y graph, detalle/diffs, cambios locales, GitHub clone y
acciones Git guardadas. Durante la inspección GitCanvas no añade ni quita archivos del
index, no crea commits ni elimina archivos. Checkout, fast-forward pull y push sí
modifican estado Git de forma explícita. Pull no crea merges y push nunca fuerza.

## Estado del trabajo en curso

La implementación del workspace está en `dev`, con pestañas, restauración perezosa,
favoritos, recientes, recuperación de rutas y persistencia atómica. Los commits son
locales por instrucción de David; no se hicieron push, PR ni release. Los controles
locales y E2E se ejecutan en macOS; la matriz Linux/Windows y los atajos del menú nativo
siguen pendientes en WS-17. La creación de commits desde la interfaz sigue reservada
para v0.4. Consultar TASKS.md para evidencia y resultados actuales.

## Documentos

- [Plan de endurecimiento](plan/2026-10-04-plan-de-endurecimiento.md)
- [Plan de tres funcionalidades](plan/2026-10-08-plan-tres-funcionalidades.md)
- [Plan rector](plans/2026-09-08-plan-de-implementacion.md)
- [Contexto arquitectónico](../CONTEXT.md)
- [Decisiones de arquitectura](adr/)
- [Ficha del asset](ASSET.md)
