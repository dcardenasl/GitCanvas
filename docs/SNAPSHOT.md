# GitCanvas — snapshot

> Actualizado: 2026-11-01 · Ficha completa: [ASSET.md](ASSET.md)

## Retomar

| Campo | Estado |
|---|---|
| Release | [v0.5.0 publicada](https://github.com/dcardenasl/GitCanvas/releases/tag/v0.5.0) el 2026-10-27 |
| Implementado | Historial/gráfico, diffs, cambios locales, idiomas, workspace, favoritos, restauración, GitHub clone y checkout/pull/push protegidos |
| Estrategia aprobada | Gráfico y panel primero; creación de commits al final |
| Próxima entrega | v0.6 historial por archivo (sin implementar) |
| Siguiente tarea | FH-1: motor de historial por ruta ([plan v0.6](plan/2026-11-01-v0.6-implementacion.md)) |
| Pendiente sin evidencia | GRF-5 (v0.4) y V05-VERIFY: Windows nativo y lector de pantalla real; ver [v0.4](verification/v0.4.md) y [v0.5](verification/v0.5.md) |
| Fuentes | [TASKS.md](../TASKS.md) y [roadmap vigente](plan/2026-10-19-roadmap-de-versiones.md) |

La secuencia objetivo es v0.4 gráfico/colores, v0.5 panel/filtros, v0.6 historial por
archivo, v0.7 stash de solo lectura, v0.8 vista de imágenes, v0.9 contribuyentes/releases, v0.10 proveedores, v0.11 crear/conectar repositorios,
v0.12 escrituras locales seguras (stash y ramas) y v0.13 preparar/crear commits. Sin fechas ni bumps aplicados.

## Estado del trabajo en curso

v0.4 (gráfico y colores) y v0.5 (panel, filtros y worktrees) están publicadas; la parte
restante de D01–D50 sigue en las versiones del roadmap. Sus comprobaciones externas y
manuales sin evidencia permanecen abiertas: no las acreditan las releases. WS-17 conserva
sus comprobaciones históricas sin evidencia. Ver [v0.4](verification/v0.4.md) y
[v0.5](verification/v0.5.md).

La inspección no prepara archivos ni crea commits. Checkout, pull fast-forward y push
son operaciones explícitas; pull no crea merges y push nunca fuerza.

## Documentos

- [Roadmap de versiones](plan/2026-10-19-roadmap-de-versiones.md)
- [Especificación del panel](plan/2026-10-18-panel-izquierdo-ui-ux.md)
- [Contratos de commits y workspace](plan/2026-10-08-plan-tres-funcionalidades.md)
- [Contexto arquitectónico](../CONTEXT.md)
- [Decisiones de arquitectura](adr/)
