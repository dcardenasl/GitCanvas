# GitCanvas — ficha del asset

> Estado actualizado: 2026-10-05. La fuente de ejecución es [`TASKS.md`](../TASKS.md);
> la fase de endurecimiento se define en [`plan/2026-10-04-plan-de-endurecimiento.md`](plan/2026-10-04-plan-de-endurecimiento.md).

## Identidad

| Campo | Valor |
|---|---|
| Slug | `gitcanvas` |
| Tipo | Aplicación de escritorio para inspección de Git |
| Repositorio | `dcardenasl/gitcanvas` (privado) |
| Licencia | Todos los derechos reservados |
| Versión objetivo | v0.1.0 |
| Estado | MVP implementado; endurecimiento H2 pendiente; release no publicado |
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
| Watcher de metadata y recuperación degradada | Implementado; falta validar E2E multiplataforma en CI sobre el código vigente |
| GitHub: credencial en keychain, listado y clone | Implementado |
| Checkout, pull fast-forward y push | Implementado con guardias |
| Endurecimiento H2 | 43 de 46 implementaciones archivadas; 34 cierres con commit. H2-34–41 y H2-43 requieren reconciliar commits; H2-25, H2-42 y H2-45 siguen abiertas |
| Publicación v0.1.0 | PR [#1](https://github.com/dcardenasl/gitcanvas/pull/1) abierta en SHA `7f24bb6`; el checkout `dev` tiene commits y cambios locales posteriores que la PR aún no evalúa. El último CI visible es de 2026-09-26 y falló antes de ejecutar pasos; aprobación/merge, tag y publicación siguen pendientes |

## Próximo paso

Continuar en [`TASKS.md`](../TASKS.md), comenzando por H2-25 y respetando el orden,
criterios y evidencia de cada tarea. La release usa exclusivamente el procedimiento de
`CLAUDE.md` y requiere aprobación de David para mergear el PR.

## Registro

- 2026-10-05: estado, plataforma, capacidades y pendientes sincronizados con el código,
  el plan de endurecimiento y `TASKS.md`.
- 2026-09-08: creación del concepto y definición inicial de stack y alcance.
