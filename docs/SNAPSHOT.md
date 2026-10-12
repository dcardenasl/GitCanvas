# GitCanvas — snapshot

> Actualizado: 2026-10-12 · Ficha completa: [ASSET.md](ASSET.md)

## Retomar

| Campo | Estado |
|---|---|
| Etapa | v0.1.0 publicado; internacionalización en revisión |
| H2 | Cerrada: 46/46; 38 cierres con commit dedicado y H2-34–41 integradas en `437ff07` |
| Release | v0.1.0 publicado el 2026-10-09: PR [#1](https://github.com/dcardenasl/gitcanvas/pull/1) mergeada, tag sobre `main` e instaladores de Linux, macOS y Windows |
| Trabajo abierto | [PR #9](https://github.com/dcardenasl/GitCanvas/pull/9): interfaz en inglés y español |
| Siguiente tarea | I18N-6: evidencia de CI en Linux y Windows para la PR #9 |
| Fuente de trabajo | [`TASKS.md`](../TASKS.md), criterios detallados en el plan H2 |

El MVP incluye historial y graph, detalle/diffs, cambios locales, GitHub clone y
acciones Git guardadas. Durante la inspección GitCanvas no añade ni quita archivos del
index, no crea commits ni elimina archivos. Checkout, fast-forward pull y push sí
modifican estado Git de forma explícita. Pull no crea merges y push nunca fuerza.

## Estado del trabajo en curso

`dev` contiene la internacionalización (I18N-1 a I18N-5, archivadas) y está publicado en la
PR #9. Solo se verificó localmente en macOS; el run de `quality` de esa PR es la evidencia que
falta para Linux y Windows. No declarar verde lo que no se haya ejecutado sobre el código
vigente. Las secciones 2 y 4 del plan de tres funcionalidades no tienen tareas todavía.

## Documentos

- [Plan de endurecimiento](plan/2026-10-04-plan-de-endurecimiento.md)
- [Plan de tres funcionalidades](plan/2026-10-08-plan-tres-funcionalidades.md)
- [Plan rector](plans/2026-09-08-plan-de-implementacion.md)
- [Contexto arquitectónico](../CONTEXT.md)
- [Decisiones de arquitectura](adr/)
- [Ficha del asset](ASSET.md)
