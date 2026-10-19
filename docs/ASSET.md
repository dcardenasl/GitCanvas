# GitCanvas — ficha del asset

> Estado actualizado: 2026-10-19. La fuente de ejecución es [`TASKS.md`](../TASKS.md);
> la fase de endurecimiento se define en [`plan/2026-10-04-plan-de-endurecimiento.md`](plan/2026-10-04-plan-de-endurecimiento.md).

## Identidad

| Campo | Valor |
|---|---|
| Slug | `gitcanvas` |
| Tipo | Aplicación de escritorio para inspección de Git |
| Repositorio | [`dcardenasl/gitcanvas`](https://github.com/dcardenasl/gitcanvas) |
| Licencia | MIT (véase LICENSE) |
| Versión publicada | [v0.3.1](https://github.com/dcardenasl/GitCanvas/releases/tag/v0.3.1) |
| Estado | v0.3.1 publicada; próxima entrega centrada en líneas y colores de ramas |
| Stack | Tauri 2, Rust/libgit2, React, TypeScript, Vite |

## Propósito y alcance

GitCanvas presenta el historial de branches y commits como un graph navegable y permite
inspeccionar diffs de commits y cambios locales. Abre repositorios locales y clona
repositorios GitHub en una caché propia. Las acciones Git explícitas son checkout
protegido, pull fast-forward y push autenticado que nunca fuerza. No es estrictamente
read-only; véase [`CONTEXT.md`](../CONTEXT.md) y el [ADR 0001](adr/0001-working-tree-observation.md).

## Estado de capacidades

| Capacidad | Estado |
|---|---|
| Historial paginado y graph resumible | Implementado |
| Detalle de commit y diff por archivo | Implementado, contra el primer parent |
| Snapshot, diff y contenido de cambios locales | Implementado con límites y fingerprint |
| Watcher de metadata y recuperación degradada | Implementado; E2E verde en Linux, macOS y Windows en CI |
| GitHub: credencial en keychain, listado y clone | Implementado |
| Checkout, pull fast-forward y push | Implementado con guardias |
| Endurecimiento H2 | Cerrado: 46 de 46; 38 cierres con commit dedicado y H2-34–41 integradas en `437ff07` |
| Interfaz en inglés y español | Publicada en v0.2.0; CI verde en Linux, macOS y Windows |
| Workspace: pestañas, favoritos y restauración | Publicado en v0.3.0; conciliar evidencia manual histórica en GRF-0/WS-17 |
| Publicación | v0.3.0 y v0.3.1 publicadas; quality y publicación de v0.3.1 completadas correctamente |

## Próximo paso

Preparar v0.4: líneas y colores del gráfico, empezando por GRF-0/GRF-1 en
[TASKS.md](../TASKS.md). El [roadmap aprobado](plan/2026-10-19-roadmap-de-versiones.md)
define la secuencia: gráfico → panel/filtros → historial por archivo →
contribuyentes/releases → proveedores → crear/conectar repositorios → gestión de
ramas → preparar/crear commits (objetivo v0.11). Sustituye la anterior reserva de
commits para v0.4. Cada publicación sigue el procedimiento de CLAUDE.md.

## Registro

- 2026-10-19: roadmap aprobado; gráfico/panel primero y commits al final. Estado documental reconciliado con v0.3.1; evidencia manual histórica por revisar.

- 2026-10-12: v0.2.0 publicado con la interfaz en inglés y español; H2 e I18N cerradas.
- 2026-10-09: v0.1.0 publicado.
- 2026-10-05: estado, plataforma, capacidades y pendientes sincronizados con el código,
  el plan de endurecimiento y `TASKS.md`.
- 2026-09-08: creación del concepto y definición inicial de stack y alcance.
