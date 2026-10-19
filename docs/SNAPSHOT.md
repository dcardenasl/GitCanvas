# GitCanvas — snapshot

> Actualizado: 2026-10-19 · Ficha completa: [ASSET.md](ASSET.md)

## Retomar

| Campo | Estado |
|---|---|
| Release | [v0.3.1 publicada](https://github.com/dcardenasl/GitCanvas/releases/tag/v0.3.1); quality y publicación completadas correctamente |
| Implementado | Historial/gráfico, diffs, cambios locales, idiomas, workspace, favoritos, restauración, GitHub clone y checkout/pull/push protegidos |
| Estrategia aprobada | Gráfico y panel primero; creación de commits al final |
| Próxima entrega | v0.4: líneas y colores estables por rama |
| Siguiente tarea | GRF-0 (conciliar evidencia WS-17) y GRF-1 (contrato/casos de referencia) |
| Fuentes | [TASKS.md](../TASKS.md) y [roadmap vigente](plan/2026-10-19-roadmap-de-versiones.md) |

La secuencia objetivo es v0.4 gráfico/colores, v0.5 panel/filtros, v0.6 historial por
archivo, v0.7 contribuyentes/releases, v0.8 proveedores, v0.9 crear/conectar repositorios,
v0.10 gestión de ramas y v0.11 preparar/crear commits. Sin fechas ni bumps aplicados.

## Estado del trabajo en curso

El panel tiene especificación D01–D50, todavía sin implementación. La conversación
aprueba el roadmap y su registro documental; no inicia implementación ni publicación.
Las restricciones locales de la sesión del 2026-10-14 son históricas: posteriormente
se publicaron v0.3.0 y v0.3.1. Conservar las comprobaciones manuales de WS-17 sin
acreditar hasta conciliar evidencia; CI verde no demuestra cada recorrido manual.

La inspección no prepara archivos ni crea commits. Checkout, pull fast-forward y push
son operaciones explícitas; pull no crea merges y push nunca fuerza.

## Documentos

- [Roadmap de versiones](plan/2026-10-19-roadmap-de-versiones.md)
- [Especificación del panel](plan/2026-10-18-panel-izquierdo-ui-ux.md)
- [Contratos de commits y workspace](plan/2026-10-08-plan-tres-funcionalidades.md)
- [Contexto arquitectónico](../CONTEXT.md)
- [Decisiones de arquitectura](adr/)
