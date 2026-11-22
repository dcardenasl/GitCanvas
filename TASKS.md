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

Empezar CR-1 de la cola de v0.9 (plan revisado por el Arquitecto; CR-D15 y CR-D23 confirmadas por David el 2026-11-16), según el [plan](docs/plan/2026-11-16-v0.9-implementacion.md). La
cola de v0.8 está archivada en `ARCHIVES.md`.

## Cola de trabajo

### v0.9: Contribuyentes y releases (CR-0–CR-16)

Plan: [decisiones CR-D01–D30, contrato, matriz de 56 casos y tareas](docs/plan/2026-11-16-v0.9-implementacion.md), con la revisión del Arquitecto incorporada.
Arquitectura: [ADR 0011](docs/adr/0011-author-identities-and-catalog.md) y [ADR 0012](docs/adr/0012-releases-tag-fetch-and-downloads.md), propuestos.
Orden de ejecución: autores (CR-1–CR-6b), cerrojo (CR-7), fuente (CR-9a), tags (CR-8), releases (CR-9b–CR-14b), cierre (CR-15–CR-16).

- [x] **CR-0: Plan, contrato y ADR.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-0-plan-contrato-y-adr). Plan v0.9, ADR 0011 y 0012 propuestos, decisiones CR-D01–D30, matriz de 56 casos y tareas; reordenado tras la revisión del Arquitecto. Sin código. → `docs(plan): add v0.9 implementation plan and adr 0011 and 0012`
- [x] **CR-1: Núcleo: identidades y `.mailmap`.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-1-núcleo-identidades-y-mailmap). Casos 1–4, 42. Depende de CR-0. → `feat(core): resolve author identities through mailmap`
- [x] **CR-2: Núcleo: catálogo progresivo.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-2-núcleo-catálogo-progresivo). Casos 5–9, 41. Depende de CR-1. → `feat(core): scan the author catalog in bounded chunks`
  *Evidencia:* trozos delta de hasta 5.000 commits, cursor ligado a raíces y `.mailmap`, cancelación entre llamadas y límites de historial e identidades. Pasaron `cargo test -p gitcanvas-core` (299 pruebas, 4 omitidas por la suite), `cargo clippy -p gitcanvas-core --all-targets -- -D warnings`, `npm test` (946 pruebas), `npm run lint`, `cargo fmt --all --check` y `python3 .dcl/dcl.py doc-check`. El límite de historial se prueba con un presupuesto reducido. El límite de identidades se comprueba a través de trozos y en el borde de 100.000.
- [x] **CR-3: Núcleo: commits de un autor.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-3-núcleo-commits-de-un-autor). Casos 10–11. Depende de CR-1. → `feat(core): page the commits of one author`
  *Evidencia:* paginación de 501 IDs en dos páginas en orden y fuera del historial visible, autor ausente e invalidación por cambios en raíces y `.mailmap`. Pasaron `cargo test -p gitcanvas-core` (302 pruebas, 4 omitidas por la suite), `cargo clippy -p gitcanvas-core --all-targets -- -D warnings`, `cargo fmt --all --check`, `npm test` (946 pruebas), `npm run lint` y `python3 .dcl/dcl.py doc-check`.
- [x] **CR-4: IPC y bindings de autores.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-4-ipc-y-bindings-de-autores). Casos 35 (autores). Depende de CR-2, CR-3. → `feat(ipc): expose the author catalog and author commits`
  *Evidencia:* ambos comandos pasan por `read` y `with_repo`; la prueba IPC rechaza rutas no autorizadas y verifica aislamiento entre repositorios. QA Haiku 5.5: aprobado para CR-4; las observaciones restantes quedan fuera del caso 35. Pasaron `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` (60 IPC, 88 core + 1 ignorado y todas las integraciones), `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (946), `python3 .dcl/dcl.py doc-check` y `git diff --check`; Specta regeneró los bindings sin deriva.
- [x] **CR-4a: Pruebas IPC de cursores y caché de autores.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-4a-pruebas-ipc-de-cursores-y-caché-de-autores). Caso 35 (ampliación IPC). Depende de CR-4. → `test(ipc): verify author cursor and cache isolation`
  *Evidencia:* la prueba pagina 501 commits por IPC, continúa válidamente en A, comprueba la respuesta propia de B y rechaza allí el cursor de A como `StaleCursor`. La prueba A → B → A verifica el mismo autor con conteos distintos y ambas cachés calientes. QA Haiku 5.5: aprobado sin bloqueantes. Pasaron `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` (61 IPC, 88 core, 1 ignorado y suites de integración), `npm test` (946), `npm run lint`, `python3 .dcl/dcl.py doc-check` y `git diff --check`.
- [x] **CR-5: Estado frontend de autores.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-5-estado-frontend-de-autores). Casos 13 (estado). Depende de CR-4. → `feat(authors): add author catalog and navigation queries`
  *Evidencia:* `src/state/authors.test.tsx` cubre selección aislada por raíz, acumulación delta y reinicio por cursor obsoleto, ID actual en una página posterior, navegación anterior y siguiente entre páginas, avance a un commit en una página no cargada, límites primero/último e ID desconocido. Pasaron `npm test` (101 archivos, 954 pruebas), `npm run lint`, `python3 .dcl/dcl.py doc-check` (`doc-check: todo en orden`) y `git diff --check`.
- [ ] **CR-6a: Panel de autores y navegación.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-6a-panel-de-autores-y-navegación). Casos 13, 36. Depende de CR-5. → `feat(authors): add the author panel and navigation`
- [ ] **CR-6b: Atenuado en el gráfico y la tabla.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-6b-atenuado-en-el-gráfico-y-la-tabla). Casos 12, 36. Depende de CR-6a. → `feat(authors): dim non-selected authors in the graph and table`
- [ ] **CR-7: Núcleo: cerrojo por directorio común y puerta de transferencia.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-7-núcleo-cerrojo-por-directorio-común-y-puerta-de-transferencia). Casos 18, 39, 40. Depende de CR-0. → `feat(core): serialize writes per git common directory and add a transfer gate`
- [ ] **CR-9a: Núcleo: fuente de releases, remoto y errores tipados.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-9a-núcleo-fuente-de-releases-remoto-y-errores-tipados). Casos 20, 49, 50, 56. Depende de CR-0. → `feat(core): identify the github release source and type access errors`
- [ ] **CR-8: Núcleo: `fetch_tag` y `pull` sin tags indiscriminados.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-8-núcleo-fetch_tag-y-pull-sin-tags-indiscriminados). Casos 14–17, 19, 38, 45, 46. Depende de CR-7, CR-9a. → `feat(core): fetch one tag explicitly and stop pull from fetching all tags`
- [ ] **CR-9b: Núcleo: listado REST de releases.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-9b-núcleo-listado-rest-de-releases). Casos 21, 22 (núcleo), 23, 27, 28, 51–53. Depende de CR-9a. → `feat(core): list github releases with bounded pagination`
- [ ] **CR-10: Núcleo: caché de releases.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-10-núcleo-caché-de-releases). Casos 25, 26, 28. Depende de CR-9b. → `feat(core): cache release listings apart from clones`
- [ ] **CR-11a: Núcleo: descarga, destino y cancelación.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-11a-núcleo-descarga-destino-y-cancelación). Casos 29–31, 34, 47, 48. Depende de CR-7, CR-9b. → `feat(core): download release assets to a chosen destination`
- [ ] **CR-11b: Núcleo: redirecciones, hosts y `sha256`.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-11b-núcleo-redirecciones-hosts-y-sha256). Casos 32, 33. Depende de CR-11a. → `feat(core): validate download redirects and verify digests`
- [ ] **CR-12: IPC y bindings de releases, tags y descargas.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-12-ipc-y-bindings-de-releases-tags-y-descargas). Casos 35, 43, 44. Depende de CR-8, CR-10, CR-11b. → `feat(ipc): expose releases, tag fetch and asset downloads`
- [ ] **CR-13: Estado frontend de releases y acción pendiente.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-13-estado-frontend-de-releases-y-acción-pendiente). Casos 27, 55. Depende de CR-12. → `feat(releases): add release queries and resumable pending actions`
- [ ] **CR-14a: Lista única de tags y releases con notas.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-14a-lista-única-de-tags-y-releases-con-notas). Casos 22, 24, 36, 51, 54. Depende de CR-13. → `feat(releases): add the unified tags and releases list`
- [ ] **CR-14b: Acciones: traer tag, descargar, acceso y sin conexión.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-14b-acciones-traer-tag-descargar-acceso-y-sin-conexión). Casos 25, 36. Depende de CR-14a. → `feat(releases): add tag fetch, downloads and access recovery to the panel`
- [ ] **CR-15: Accesibilidad, i18n y E2E.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-15-accesibilidad-i18n-y-e2e). Casos 36, 37. Depende de CR-6b, CR-14b. → `test(e2e): cover authors and releases across themes and languages`
- [ ] **CR-16: Verificación final y documentación.** [Plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-16-verificación-final-y-documentación). Casos Todos, 38, 54. Depende de CR-15. → `docs(plan): record v0.9 verification and update product docs`

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
