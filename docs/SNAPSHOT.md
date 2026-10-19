# GitCanvas — snapshot

> Actualizado: 2026-10-19 · Ficha completa: [ASSET.md](ASSET.md)

## Retomar

| Campo | Estado |
|---|---|
| Release | [v0.3.1 publicada](https://github.com/dcardenasl/GitCanvas/releases/tag/v0.3.1); quality y publicación completadas correctamente |
| Implementado | Historial/gráfico, diffs, cambios locales, idiomas, workspace, favoritos, restauración, GitHub clone y checkout/pull/push protegidos |
| Estrategia aprobada | Gráfico y panel primero; creación de commits al final |
| Próxima entrega | v0.4 implementada en dev; verificación externa pendiente |
| Siguiente tarea | GRF-5: completar matriz externa y comprobaciones manuales; ver evidencia v0.4 |
| Fuentes | [TASKS.md](../TASKS.md) y [roadmap vigente](plan/2026-10-19-roadmap-de-versiones.md) |

La secuencia objetivo es v0.4 gráfico/colores, v0.5 panel/filtros, v0.6 historial por
archivo, v0.7 contribuyentes/releases, v0.8 proveedores, v0.9 crear/conectar repositorios,
v0.10 gestión de ramas y v0.11 preparar/crear commits. Sin fechas ni bumps aplicados.

## Estado del trabajo en curso

La implementación de v0.4 está en commits locales: snapshot de referencias,
upstreams, persistencia de colores/principal por worktree, líneas incrementales,
controles y pruebas. La parte restante de D01–D50 sigue en las versiones del roadmap.
Ver [evidencia y pendientes](verification/v0.4.md). v0.3.1 sigue publicada; no se
hicieron push, PR, cambios de versión ni publicación para esta implementación.
WS-17 conserva comprobaciones manuales históricas sin evidencia; la matriz anterior
no acredita la revisión nueva de dev.

La inspección no prepara archivos ni crea commits. Checkout, pull fast-forward y push
son operaciones explícitas; pull no crea merges y push nunca fuerza.

## Documentos

- [Roadmap de versiones](plan/2026-10-19-roadmap-de-versiones.md)
- [Especificación del panel](plan/2026-10-18-panel-izquierdo-ui-ux.md)
- [Contratos de commits y workspace](plan/2026-10-08-plan-tres-funcionalidades.md)
- [Contexto arquitectónico](../CONTEXT.md)
- [Decisiones de arquitectura](adr/)
