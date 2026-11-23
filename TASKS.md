# TASKS — GitCanvas

> Fuente de verdad del trabajo **pendiente**. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Todo lo completado, con su evidencia, está en
> [`ARCHIVES.md`](ARCHIVES.md). Secuencia de versiones:
> [roadmap](ROADMAP.md).

**Estado al 2026-11-23:** v0.4–v0.9 preparadas/publicadas conforme al cierre documental de
v0.9.0. La cola CR-0–CR-17 está archivada; la verificación y los límites restantes están
en `ARCHIVES.md`. Siguen abiertos los gates de lector, diálogos/plataformas y las pruebas
complementarias de CR-17. Próximo trabajo: planificar v0.10, múltiples proveedores,
conservando el orden aprobado. Crear commits permanece al final de la secuencia (objetivo
v0.13). El roadmap vigente prevalece sobre asignaciones de versiones de planes anteriores.

**Estado de trabajo:** rama `dev`. Se preservan sin seguimiento `docs/audits/evidence/`,
`docs/media/`, `install-backups/` y `tools/demo/record-v05*`; no agregarlos a commits. No
crear tags ni publicar como parte de la implementación; los bumps son del flujo `/release`.

## Siguiente paso

Planificar v0.10, múltiples proveedores, manteniendo el orden aprobado del roadmap. Para la
publicación de v0.9.0, seguir el commit/PR ya preparado y detenerse antes del merge para la
aprobación de David. Los gates abiertos permanecen aquí y en Known limitations.

## Gates abiertos y seguimiento histórico

### Gates externos y seguimiento histórico (sin evidencia)

Verificaciones que no se pudieron ejecutar o documentar; conservan su plan de origen y no
bloquean el desarrollo de v0.9.

- [ ] **V09-VERIFY-CR15-DOWNLOAD-PLATFORMS — Diálogo y no sobrescritura por plataforma.**
      Parcial: el bundle 0.9.0 consultó GitHub real y guardó/renombró un asset de v0.8.0 en
      macOS, con SHA-256 coincidente. Falta comprobar la confirmación de sobrescritura en
      macOS y probar destino/renombrado/no sobrescritura en Linux y Windows. La matriz
      automatizada pasó en Ubuntu, macOS y Windows, pero no cubre esos diálogos reales.
      Evidencia macOS: [`seguimiento ARM64`](docs/verification/v0.9-macos-arm64-followup.md).
- [ ] **V09-VERIFY-CR17-LIVE-GITHUB — Smoke de la release publicada.**
      La app 0.9.0 ya consultó GitHub real y abrió notas/Full Changelog de v0.8.0; también
      descargó un asset y comprobó su SHA-256. Falta repetir la consulta desde la app contra
      la release v0.9.0 publicada, comprobar el chip estable, sus notas/adjuntos y verificar
      el SHA-256 de un asset. La release aún no está publicada, así que este gate no puede
      cerrarse antes del workflow posterior al merge.
- [ ] **V09-VERIFY-CR17-UIR05-RESTART — Persistencia tras reinicio de la app.**
      Cerrar y reabrir la app instalada después de plegar Autores y Releases en una raíz;
      confirmar que cada preferencia se restaure solo para esa raíz y que la selección del
      autor/énfasis no se pierda. Serialización/restauración sí tiene cobertura automatizada;
      falta el smoke test del proceso instalado.
- [ ] **V09-VERIFY-CR17-UIR08-FOCUS-SCROLL — Retorno interactivo de foco y scroll.**
      Verificar abrir/cerrar detalle y retorno a la fila con teclado/clic, conservando scroll,
      en EN/ES × claro/oscuro a 940×600 y 1440×900. E2E ya acredita Escape y retorno de foco
      en un recorrido; las capturas acreditan estados visuales, no la matriz completa de
      interacción/scroll.
- [ ] **V09-VERIFY-CR17-ASSET-RESOURCES — Descarga grande y recuperación de recursos.**
      En la app instalada, descargar o cancelar un asset de 80 MiB o más del release v0.8.0
      (por ejemplo `GitCanvas_0.8.0_amd64.AppImage`, 83,077,624 bytes) y confirmar que una
      consulta y una descarga pequeña posteriores siguen funcionando y no conservan recursos
      de la transferencia. Los límites y cancelación tienen tests con fixtures; este escenario
      nativo grande aún no se ejecutó.
- [ ] **A11Y-LECTOR — Lector de pantalla real y recorridos manuales (aceptado sin verificar).**
      Sin sesión real con VoiceOver, NVDA u Orca. Decisión de David del 2026-11-16: aceptar
      como no verificado y documentarlo en Known limitations; no volver a pedir esta decisión.
      Los roles/estados automatizados no sustituyen una prueba con lector real.
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
