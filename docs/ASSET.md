# GitCanvas — ficha del asset

> Estado actualizado: 2026-10-12. La fuente de ejecución es [`TASKS.md`](../TASKS.md);
> la fase de endurecimiento se define en [`plan/2026-10-04-plan-de-endurecimiento.md`](plan/2026-10-04-plan-de-endurecimiento.md).

## Identidad

| Campo | Valor |
|---|---|
| Slug | `gitcanvas` |
| Tipo | Aplicación de escritorio para inspección de Git |
| Repositorio | [`dcardenasl/gitcanvas`](https://github.com/dcardenasl/gitcanvas) |
| Licencia | Todos los derechos reservados |
| Versión publicada | [v0.1.0](https://github.com/dcardenasl/gitcanvas/releases/tag/v0.1.0) (2026-10-09) |
| Estado | v0.1.0 publicado; internacionalización (inglés y español) en la PR #9 |
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
| Interfaz en inglés y español | Implementada en `dev` ([PR #9](https://github.com/dcardenasl/GitCanvas/pull/9)); falta la evidencia de CI en Linux y Windows (I18N-6) |
| Publicación v0.1.0 | Publicada. PR [#1](https://github.com/dcardenasl/gitcanvas/pull/1) mergeada en `59d8d73` y tag `v0.1.0` sobre `main`; el workflow `release` creó el Release con instaladores de Linux, macOS y Windows |

## Próximo paso

Continuar en [`TASKS.md`](../TASKS.md): cerrar I18N-6 con el run de `quality` de la PR #9 y
planificar las secciones 2 y 4 del plan de tres funcionalidades. Cada release usa
exclusivamente el procedimiento de `CLAUDE.md` y requiere aprobación de David para mergear
el PR.

## Registro

- 2026-10-12: v0.1.0 publicado y H2 cerrada; internacionalización implementada en `dev`.
- 2026-10-05: estado, plataforma, capacidades y pendientes sincronizados con el código,
  el plan de endurecimiento y `TASKS.md`.
- 2026-09-08: creación del concepto y definición inicial de stack y alcance.
