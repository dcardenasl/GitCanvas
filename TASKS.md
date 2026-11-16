# TASKS — GitCanvas

> Fuente de verdad del trabajo **pendiente**. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Todo lo completado, con su evidencia, está en
> [`ARCHIVES.md`](ARCHIVES.md). Secuencia de versiones:
> [roadmap](ROADMAP.md).

**Estado al 2026-11-16:** v0.4–v0.8 publicadas; v0.8.0 está etiquetada y `main` contiene el
merge del PR #23. Crear commits permanece al final de la secuencia (objetivo v0.13). El
roadmap vigente prevalece sobre asignaciones de versiones de planes anteriores. Los gates externos
sin evidencia (abajo) siguen abiertos y no se dan por cerrados.

**Estado de trabajo:** rama `dev`. Se preservan sin seguimiento `docs/audits/evidence/`,
`docs/media/`, `install-backups/` y `tools/demo/record-v05*`; no agregarlos a commits. No
crear tags ni publicar como parte de la implementación; los bumps son del flujo `/release`.

## Siguiente paso

Preparar el plan de v0.9 (contribuyentes y releases) según el [roadmap](ROADMAP.md) y su
[protocolo](docs/protocolo-roadmap.md). La cola de v0.8 está archivada en `ARCHIVES.md`.

## Cola de trabajo

### Gates externos y seguimiento histórico (sin evidencia)

Verificaciones que no se pudieron ejecutar o documentar; conservan su plan de origen y no
bloquean el desarrollo de v0.9.

- [ ] **GRF-5 — Verificación de v0.4 (gate externo).** Origen:
      [roadmap, v0.4](ROADMAP.md#entrega-de-referencia-v04-plan-histórico)
      (GRF-5) y [verificación v0.4](docs/verification/v0.4.md). Verificado en macOS (807 pruebas
      frontend, 220 Rust, siete specs/dieciséis pruebas E2E, ambos temas e idiomas a 940×600,
      fixture de 10.000 commits). **Pendiente, sin evidencia:** Linux y Windows nativos, lector
      de pantalla real y recorridos manuales. No se declaran verificados.
- [ ] **V05-VERIFY — Verificación y cierre documental (seguimiento de gates externos).** [Plan](docs/plan/2026-10-26-v0.5-implementacion.md#v05-verify--verificacion-y-documentacion-de-cierre), [evidencia v0.5](docs/verification/v0.5.md), [verificación v0.4](docs/verification/v0.4.md), [`CLAUDE.md`](CLAUDE.md). v0.5.0 ya está publicada. Verificado localmente: macOS (831 pruebas frontend, ocho specs E2E nativos), Linux arm64 (830 pruebas frontend, ocho specs/20 recorridos E2E, Rust, Clippy y build), compilación cruzada MSVC (check, Clippy estricto, tests `--no-run` y enlace release), temas, idiomas, 940×600 e indicador del diff. **Pendiente, sin evidencia:** E2E en Windows nativo y prueba con lector de pantalla real; los intentos con VoiceOver solo confirmaron árbol de accesibilidad y foco de teclado, no anuncios. No se declaran verificados.
- [ ] **V07-VERIFY — Gates externos de v0.7 (stash de solo lectura).** Origen:
      [plan v0.7](docs/plan/2026-11-08-v0.7-implementacion.md) (ST-7/ST-8),
      [ADR 0009](docs/adr/0009-read-only-stash.md) y [verificación v0.7](docs/verification/v0.7.md).
      Verificado en macOS (909 pruebas frontend, Rust, lint, tipos, formato, auditorías, build y
      cinco recorridos E2E). **Pendiente, sin evidencia:** E2E nativo en Linux y Windows y lector
      de pantalla real. La etiqueta `v0.7.0` existe y `main` contiene el merge del PR #22; esta
      tarea no verifica la publicación remota.
- [ ] **V08-VERIFY — Gates externos de v0.8 (vista de imágenes).** Origen:
      [plan v0.8](docs/plan/2026-11-15-v0.8-implementacion.md) (IMG-7/IMG-8),
      [ADR 0010](docs/adr/0010-image-viewing.md) y [verificación v0.8](docs/verification/v0.8.md).
      Verificado en macOS (927 pruebas frontend, Rust, lint, tipos, formato, auditorías, build y
      E2E nativo de historial de imágenes). **Pendiente, sin evidencia:** E2E nativo en Linux y
      Windows y lector de pantalla real. La etiqueta `v0.8.0` existe y la release está publicada.
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

---
