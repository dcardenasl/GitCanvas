# TASKS — GitCanvas

> Fuente de verdad de ejecución. El plan rector está en
> [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones de trabajo y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).
> Historial de tareas completadas: [`ARCHIVES.md`](ARCHIVES.md).

**Estado:** H2 25/46 completadas · 21 pendientes (H2-25 a H2-45) · Release v0.1.0 pendiente (R-4 a R-6) · actualizado 2026-10-05

## Cómo se usa este archivo

- **Una tarea = un commit.** El ID de la tarea es estable para siempre: no se renumera
  nunca, y si se cancela se deja `~~tachada~~` con el motivo.
- **Cada tarea se marca `[x]` en el mismo commit que la implementa.** Nunca por lotes al
  final: el valor del archivo es que su estado sea cierto en cualquier punto del
  historial, para que una sesión nueva haga `git pull` y sepa exactamente dónde está.
- Cuando aparece algo que el plan no previó, se anota bajo la tarea con
  `*Hallazgo durante la ejecución:*`. Eso evita que la próxima sesión repita el error.
- La flecha `→` de cada tarea es el mensaje de commit exacto que le corresponde.

---

## 🧭 Fase H2 — Endurecimiento post-auditoría (en curso)

Plan de trabajo derivado de la auditoría estática completa del 2026-10-04:
[`docs/plan/2026-10-04-plan-de-endurecimiento.md`](docs/plan/2026-10-04-plan-de-endurecimiento.md).
Ese documento contiene los hallazgos, ubicaciones, criterios técnicos, orden de fases y
verificación manual completos; leerlo antes de ejecutar cada tarea. La auditoría inicial
indica que se respetan las decisiones rectoras, pero sus hallazgos deben verificarse en
el código antes de modificarlos. Si no se reproducen, descartar el hallazgo y dejar la
evidencia aquí.

**Convenciones:** trabajar en `dev`; una unidad verificable y un commit por tarea; mensaje
de commit de una línea en inglés, sin trailers ni menciones a IA; nombrar explícitamente
los archivos tocados; actualizar esta tarea en el mismo commit que la implementación.
Actualizar `CHANGELOG.md` solo para `feat`, `fix` o `perf`. Ejecutar las comprobaciones
pertinentes del plan y registrar resultados/hallazgos. No iniciar publicación a `main`:
la sigue controlando exclusivamente `/release` y requiere aprobación de David.
Los commits `c954492` (branding) y `7f24bb6` (grabador de demo) ya están presentes en
`dev`; la auditoría los tuvo en cuenta y no son tareas pendientes.

Las tareas H2-0 a H2-24 están completadas y archivadas en [`ARCHIVES.md`](ARCHIVES.md).
La siguiente tarea es H2-25. Está parcialmente implementada, pero permanece abierta
hasta obtener evidencia dinámica de arranque y E2E en los tres sistemas operativos.

- [ ] **H2-25 — Reducir permisos Tauri a los usados.** Reemplazar `core:default` por
      `core:event:default` y `dialog:allow-open`; confirmar arranque y E2E multiplataforma.
      *Implementación parcial (2026-10-05):* `capabilities/default.json` ya concede solo
      `core:event:default` y `dialog:allow-open`, coherente con el uso de eventos, comandos
      IPC de la app y selector nativo de carpetas. `quality.yml` ahora ejecuta la suite E2E
      en Linux, macOS y Windows, usando Xvfb solo en Linux; las capturas usan `os.tmpdir()`
      para no asumir `/tmp` en Windows. Se añadió un test de regresión que exige que la
      allowlist sea exactamente esos dos permisos. El JSON y los usos se verificaron por
      inspección estática; el nuevo test aún no se ha ejecutado. Pendiente la primera
      evidencia dinámica de arranque/E2E en los tres OS: la
      skill `security-audit` prohíbe ejecutar builds/tests del proyecto sin sandbox aislado,
      que esta sesión no proporciona. Mantener H2-25 abierta hasta obtener esos resultados.
      → `chore(tauri): narrow application capabilities`

### Estado, rendimiento y UX

- [ ] **H2-26 — Acotar invalidación de queries y avisos.** Invalidar por alcance
      `LIVE_QUERIES`, permitir cerrar notice, limpiarlo al cambiar repo y corregir singular
      y plural. *Implementación parcial (2026-10-05):* las acciones Git invalidan solo
      `LIVE_QUERIES` del repositorio que cambió; sus avisos se pueden cerrar y se limpian
      al cambiar de repositorio, incluso si una operación anterior termina tarde. El
      resultado de pull distingue `commit`/`commits`. Se añadieron pruebas de regresión
      para alcance, cierre, cambio de repositorio y número; aún no ejecutadas por la
      restricción de `security-audit` documentada en H2-25.
      → `fix(ui): scope live query invalidation`
- [ ] **H2-27 — Centralizar query keys y refresh en vivo.** Módulo único `queryKeys` y
      `invalidateLive()`; retirar duplicación en tres archivos, con pruebas de alcance.
      → `refactor(ui): centralize query keys and live invalidation`
- [ ] **H2-28 — Reducir trabajo de paginación de historial.** Aplicar `maxPages` o refrescar
      solo primera página según comportamiento; indexar commits con `Map`/`useMemo` y
      estabilizar `fetchNextPage`.
      → `perf(history): bound pages and index commits`
- [ ] **H2-29 — Evitar selecciones obsoletas de AppShell.** Ignorar respuesta tardía de
      startup repository y resolver selección huérfana de `revealCommit`.
      → `fix(ui): ignore stale repository and reveal selections`
- [ ] **H2-30 — Corregir teclado y ergonomía de controles.** Resizer: limpiar `userSelect`,
      doble clic vuelve al valor inicial y filtrar botones; ContextMenu: callback actualizado,
      flechas y retorno del foco; Escape cierra `FileDiffView`.
      → `fix(ui): restore focus and keyboard control behavior`
- [ ] **H2-31 — Acotar y tematizar GraphCanvas.** Un solo `filter` por `<g>`, altura limitada
      o virtualización; paleta de `graph-layout/colors.ts` por tema y test de contraste para
      ambos temas.
      → `perf(graph): bound canvas rendering and theme colors`
- [ ] **H2-32 — Mejorar búsqueda y fechas.** Cachear `Intl.DateTimeFormat`, locale `es` con
      año y `useDeferredValue` en búsqueda.
      → `perf(ui): defer search and reuse date formatters`
- [ ] **H2-33 — Unificar límites de core y debounce.** Usar `diff.stats()` sin construir
      `Patch`, fingerprint barato, política común que rechaza páginas fuera de rango y
      debounce del watcher con tope máximo; tests de límites.
      → `perf(core): bound fingerprints and watcher debounce`
- [ ] **H2-34 — Completar idioma del frontend.** Traducir textos restantes al español y
      consolidar `messageFor` con `KIND_SUMMARY`.
      → `fix(i18n): align remaining frontend messages`

### Duplicación y código muerto

- [ ] **H2-35 — Consolidar modelos y helpers de frontend.** Tipo `ChangedFile`, comparador
      de nombres, `DiffStat`, `RetryError`, `FolderIcon`, `safeStorage`, geometría compartida;
      retirar `InspectorEmpty` vacío, `selectedFileSource` duplicado, exports sin usos y
      validadores/estado de caché de clone solo si se confirma que no tienen consumidores.
      Eliminar imports duplicados de `FileDiffView.tsx`.
      → `refactor(ui): consolidate file and display helpers`
- [ ] **H2-36 — Compartir tokens y primitivos de estilo.** Tokens de espaciado, radio,
      tipografía y foco; `.button`/`.state` comunes; dividir `CommitDetailPanel.css` y
      centralizar anchos 220/310.
      → `refactor(styles): centralize design tokens and primitives`
- [ ] **H2-37 — Reducir duplicación y superficie pública de core.** Bases comunes para
      `FileDiff`/`FileDiffSummary` y contenidos; fold único de stats y `ContentRead::TooLarge`;
      unificar docs de acciones; `pub(crate)` donde baste; cfg/test-doc para métodos solo
      test; retirar `clone_url` decorativo, dev-dep redundante y conexión duplicada de push.
      → `refactor(core): consolidate diff types and internal APIs`
- [ ] **H2-38 — Completar documentación de API.** Rustdoc de campos/tipos públicos y TSDoc
      en `session.ts`, `tree.ts` y APIs públicas identificadas.
      → `docs(api): document public rust and typescript interfaces`

### Calidad de pruebas

- [ ] **H2-39 — Compartir utilidades de tests frontend.** Crear `test-utils` para
      QueryClient, mock IPC y wrapper; reemplazar selectores/clases por roles y fortalecer
      aserciones débiles.
      → `test(ui): share accessible component test utilities`
- [ ] **H2-40 — Cubrir flujos frontend y límites omitidos.** Tests de `Degraded` y timer 30s,
      fingerprint modificado, portapapeles, Resizer, reveal de HistoryView, `parseHunks`,
      expansión del working tree y `MAX_PAGES`.
      → `test(ui): cover live repository and navigation edge cases`
- [ ] **H2-41 — Corregir pruebas Rust que dan señal falsa.** Preferir `matches!` a comparar
      debug strings; eliminar `.is_err()` sin aserción; corregir tests señalados de watcher,
      worktree y GitHub API; sustituir sleeps fijos por espera con condición; mover
      `history_verification` a benches/examples.
      → `test(core): assert typed outcomes and remove timing races`
- [ ] **H2-42 — Hacer E2E determinista y relevante.** Helper `waitForHistory()`, quitar
      `browser.pause`, usar `os.tmpdir()`, retirar/fusionar specs sin aserciones, desacoplar
      `local-changes` y reducir reintentos conforme a evidencia.
      → `test(e2e): replace fixed waits with observable conditions`
- [ ] **H2-43 — Sacar herramientas de demo del CI/typecheck.** Mover scripts y recorder a
      `tools/`, consolidar variable de entorno, mensajes en inglés, documentar
      `bitacora-engine`, ffmpeg y magick.
      → `chore(demo): isolate recorder tooling and document prerequisites`

### Documentación y cierre

- [ ] **H2-44 — Sincronizar documentos de arquitectura y producto.** Actualizar `CONTEXT.md`
      y ADR 0001 para explicar watcher de metadata versus fingerprint de árbol y acotar
      “read-only” dado que existen checkout/pull/push; sincronizar README, CHANGELOG,
      DESIGN, PRODUCT, `docs/ASSET.md`, `docs/SNAPSHOT.md` y el índice/reglas de `CLAUDE.md`.
      → `docs: align architecture and product documentation`
- [ ] **H2-45 — Cerrar trazabilidad de H2.** Revisar conteo/estado de tareas, documentar
      divergencias verificadas frente al plan, commits ya registrados y evidencia final.
      Ejecutar la verificación local definida por el plan y las comprobaciones manuales
      aplicables; registrar fallos ambientales sin declararlos verdes.
      → `docs(tasks): close post-audit hardening`

**Criterio de cierre:** H2-0 a H2-45 completadas o hallazgos explícitamente descartados
con evidencia; verificación local y pruebas manuales del plan registradas; docs y TASKS
sin divergencias. La publicación sigue el proceso `/release` por separado.

---

## 🔴 Pendiente — Release v0.1.0

> Ejecutado con el skill `/release`. Ver `CLAUDE.md` para el procedimiento completo.
> R-1 a R-3 están completadas y archivadas en [`ARCHIVES.md`](ARCHIVES.md).

- [ ] **R-4 — PR `dev → main`.** Abrir, esperar `quality` verde, **esperar aprobación de
      David**, y mergear con `--merge` (nunca squash ni rebase).

- [ ] **R-5 — Tag y GitHub Release.** `v0.1.0` solo sobre `main`; `release.yml` crea el
      Release extrayendo la sección del CHANGELOG. Nunca `gh release create` a mano.

- [ ] **R-6 — Actualizar la ficha del asset.** `docs/ASSET.md` y `docs/SNAPSHOT.md`:
      versión, repositorio, estado del build por componente y log de avances.
      → `docs(asset): record the v0.1.0 release in the asset sheet`
