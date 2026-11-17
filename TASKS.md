# TASKS — GitCanvas

> Fuente de verdad del trabajo **pendiente**. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Todo lo completado, con su evidencia, está en
> [`ARCHIVES.md`](ARCHIVES.md). Secuencia de versiones:
> [roadmap](ROADMAP.md).

**Estado al 2026-11-16:** v0.4–v0.8 publicadas; v0.8.0 está etiquetada y `main` contiene el
merge del PR #23. Crear commits permanece al final de la secuencia (objetivo v0.13). El
roadmap vigente prevalece sobre asignaciones de versiones de planes anteriores. El único gate
externo abierto es `A11Y-LECTOR` (abajo), aceptado como no verificado.

**Estado de trabajo:** rama `dev`. Se preservan sin seguimiento `docs/audits/evidence/`,
`docs/media/`, `install-backups/` y `tools/demo/record-v05*`; no agregarlos a commits. No
crear tags ni publicar como parte de la implementación; los bumps son del flujo `/release`.

## Siguiente paso

Confirmar con David la decisión CR-D15 (que `pull` deje de traer todos los tags) y empezar
CR-1 de la cola de v0.9, según el [plan](docs/plan/2026-11-16-v0.9-implementacion.md). La
cola de v0.8 está archivada en `ARCHIVES.md`.

## Cola de trabajo

### v0.9: Contribuyentes y releases (CR-0–CR-16)

Plan: [decisiones CR-D01–D22, contrato, matriz de 38 casos y tareas](docs/plan/2026-11-16-v0.9-implementacion.md).
Arquitectura: [ADR 0011](docs/adr/0011-author-identities-and-catalog.md) y [ADR 0012](docs/adr/0012-releases-tag-fetch-and-downloads.md), propuestos.
Orden: autores (CR-1–CR-6), base de escritura (CR-7–CR-8), releases (CR-9–CR-14), cierre (CR-15–CR-16).

- [x] **CR-0: Plan, contrato y ADR.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-0-plan-contrato-y-adr). Plan v0.9, [ADR 0011](docs/adr/0011-author-identities-and-catalog.md) y [ADR 0012](docs/adr/0012-releases-tag-fetch-and-downloads.md) (propuestos), decisiones CR-D01–D22, matriz de 38 casos y tareas CR-1–CR-16. Sin código. → `docs(plan): add v0.9 implementation plan and adr 0011 and 0012`
- [ ] **CR-1: Núcleo: identidades y `.mailmap`.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-1-núcleo-identidades-y-mailmap). Casos 1–4. → `feat(core): resolve author identities through mailmap`
- [ ] **CR-2: Núcleo: catálogo progresivo.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-2-núcleo-catálogo-progresivo). Casos 5–9. Depende de CR-1. → `feat(core): scan the author catalog in bounded chunks`
- [ ] **CR-3: Núcleo: commits de un autor.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-3-núcleo-commits-de-un-autor). Casos 10–11. Depende de CR-1. → `feat(core): page the commits of one author`
- [ ] **CR-4: IPC y bindings de autores.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-4-ipc-y-bindings-de-autores). Caso 35. Depende de CR-2 y CR-3. → `feat(ipc): expose the author catalog and author commits`
- [ ] **CR-5: Estado frontend de autores.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-5-estado-frontend-de-autores). Casos 6 y 13. Depende de CR-4. → `feat(authors): add author catalog and navigation queries`
- [ ] **CR-6: Panel de autores, énfasis y navegación.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-6-panel-de-autores-énfasis-y-navegación). Casos 12, 13 y 36. Depende de CR-5. → `feat(authors): add the author panel, emphasis and navigation`
- [ ] **CR-7: Núcleo: exclusión de escrituras por directorio común.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-7-núcleo-exclusión-de-escrituras-por-directorio-común). Caso 18. Depende de CR-0. → `feat(core): serialize writes per git common directory`
- [ ] **CR-8: Núcleo: `fetch_tag` y `pull` sin tags indiscriminados.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-8-núcleo-fetch_tag-y-pull-sin-tags-indiscriminados). Casos 14–17, 19 y 38. Depende de CR-7 y de la confirmación de David sobre CR-D15. → `feat(core): fetch one tag explicitly and stop pull from fetching all tags`
- [ ] **CR-9: Núcleo: fuente y listado de releases.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-9-núcleo-fuente-y-listado-de-releases). Casos 20–23, 27 y 28. Depende de CR-0. → `feat(core): list github releases with typed access errors`
- [ ] **CR-10: Núcleo: caché de releases.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-10-núcleo-caché-de-releases). Casos 25 y 26. Depende de CR-9. → `feat(core): cache release listings apart from clones`
- [ ] **CR-11: Núcleo: descarga de adjuntos.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-11-núcleo-descarga-de-adjuntos). Casos 29–34. Depende de CR-9 y CR-7. → `feat(core): download release assets to a chosen destination`
- [ ] **CR-12: IPC y bindings de releases, tags y descargas.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-12-ipc-y-bindings-de-releases-tags-y-descargas). Caso 35. Depende de CR-8, CR-10 y CR-11. → `feat(ipc): expose releases, tag fetch and asset downloads`
- [ ] **CR-13: Estado frontend de releases y acción pendiente.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-13-estado-frontend-de-releases-y-acción-pendiente). Caso 27. Depende de CR-12. → `feat(releases): add release queries and resumable pending actions`
- [ ] **CR-14: Panel de tags y releases.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-14-panel-de-tags-y-releases). Casos 22, 24 y 36. Depende de CR-13. → `feat(releases): add the tags and releases panel`
- [ ] **CR-15: Accesibilidad, i18n y E2E.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-15-accesibilidad-i18n-y-e2e). Casos 36 y 37. Depende de CR-6 y CR-14. → `test(e2e): cover authors and releases across themes and languages`
- [ ] **CR-16: Verificación final y documentación.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-16-verificación-final-y-documentación). Todos los casos. Depende de CR-15. Sin bump ni release. → `docs(plan): record v0.9 verification and update product docs`

### Gates externos y seguimiento histórico (sin evidencia)

Verificaciones que no se pudieron ejecutar o documentar; conservan su plan de origen y no
bloquean el desarrollo de v0.9.

- [ ] **A11Y-LECTOR — Lector de pantalla real y recorridos manuales (decisión de David).**
      Origen: GRF-5 (v0.4), V05-VERIFY, V07-VERIFY y V08-VERIFY, cerrados el 2026-11-16 (ver
      [`ARCHIVES.md`](ARCHIVES.md#gates-externos-cerrados-2026-11-16)). El E2E nativo de Linux,
      macOS y Windows tiene evidencia en
      [`docs/verification/ci-plataformas.md`](docs/verification/ci-plataformas.md). Queda sin
      verificar el uso con un lector de pantalla real (VoiceOver, NVDA, Orca) y los recorridos
      manuales de v0.4. *Decisión de David, 2026-11-16:* se acepta como no verificado y consta
      en «Known limitations» del README. Se reabre con evidencia cuando haya un lector real.
- [ ] **WS-17 — Conciliar verificación y publicación de v0.3.0 (seguimiento histórico).**
      *Actualización 2026-10-19:* v0.3.0 y v0.3.1 ya publicadas; CI de v0.3.1 verde.
      GRF-0 debe conciliar evidencia y comprobaciones manuales antes de cerrar el ID.
      El alcance original se conserva a continuación como registro histórico.
      **Alcance original:** Corrida de `quality` sobre
      `dev` (matriz de tres sistemas, cobertura, Clippy, bindings sin deriva, E2E nativos) y
      validación manual del flujo de pestañas en cada sistema; en macOS, también ⌘O y ⌘W.
      Después, `/release` (versión confirmada con David).
      *Alcance autorizado (2026-10-14):* solo implementación y commits locales; push,
      PR, release y matriz remota quedan fuera. Esta tarea sigue abierta deliberadamente.
      *Evidencia local:* macOS; 706 pruebas frontend (95,17% statements, 96,61% líneas;
      todos los umbrales por módulo pasan), 204 pruebas Rust con todas las features;
      cinco specs/doce pruebas E2E, incluidos temas y 200 favoritos a 940×600. Tipos de
      frontend/E2E/config, lint, formato, Clippy estricto y bindings sin deriva.
      Compilación de producción completada en macOS, sin generar instaladores.
      `npm audit --omit=dev --audit-level=high` informa cero vulnerabilidades;
      `cargo deny` y `cargo audit` terminan correctamente, conservando ocho avisos
      transitivos permitidos por la política existente (incluido glib, dependiente de Tauri
      en Linux). No se relajan lints ni políticas para esta entrega.
      → `docs: close the workspace series and record the v0.3.0 verification`

### Entregas posteriores

v0.9 contribuyentes/releases → v0.10 proveedores →
v0.11 crear/conectar repositorios → v0.12 escrituras locales seguras (base de escrituras,
stash aplicar/descartar/guardar, ramas) → v0.13 preparar/crear commits. Objetivos de
planificación, sin fechas ni bumps. Desglosar cada entrega al prepararla siguiendo el
roadmap y los acuerdos existentes. Crear o retirar worktrees sigue reservado sin versión.

## Cómo se usa este archivo

- **Una tarea = un commit.** El ID de la tarea es estable para siempre: no se renumera
  nunca, y si se cancela se deja `~~tachada~~` con el motivo.
- **Cada tarea se marca `[x]` en el mismo commit que la implementa.** Nunca por lotes al
  final: el valor del archivo es que su estado sea cierto en cualquier punto del
  historial, para que una sesión nueva haga `git pull` y sepa exactamente dónde está.
- Cuando aparece algo que el plan no previó, se anota bajo la tarea con
  `*Hallazgo durante la ejecución:*`. Eso evita que la próxima sesión repita el error.
- La flecha `→` de cada tarea es el mensaje de commit exacto que le corresponde.
- Ciclo completo (cómo nace una cola, cuándo pasa a `ARCHIVES.md`, gates externos):
  [protocolo de trabajo](docs/protocolo-trabajo.md).

---
