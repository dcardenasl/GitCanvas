# TASKS — GitCanvas

> Fuente de verdad del trabajo **pendiente**. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Todo lo completado, con su evidencia, está en
> [`ARCHIVES.md`](ARCHIVES.md). Secuencia de versiones:
> [roadmap](docs/plan/2026-10-19-roadmap-de-versiones.md).

**Estado al 2026-11-15:** v0.4–v0.8 implementadas en `dev`; v0.7.0 etiquetada y `main`
contiene el merge del PR #22. v0.8.0 tiene bump de versión y CHANGELOG preparados en el commit de release; la etiqueta
se crea solo tras fusionar el PR a `main`. Crear commits permanece al final de la secuencia (objetivo v0.13). El roadmap
vigente prevalece sobre asignaciones de versiones de planes anteriores. Los gates externos
sin evidencia (abajo) siguen abiertos y no se dan por cerrados.

**Estado de trabajo:** rama `dev`. Se preservan sin seguimiento `docs/audits/evidence/`,
`docs/media/`, `install-backups/` y `tools/demo/record-v05*`; no agregarlos a commits. No
crear tags ni publicar como parte de la implementación; los bumps son del flujo `/release`.

## Siguiente paso

No quedan tareas de implementación de v0.8. Preparar el plan de v0.9 según el roadmap.

## Cola de trabajo

### v0.8 — Vista de imágenes

Plan: [implementación v0.8](docs/plan/2026-11-15-v0.8-implementacion.md) (decisiones
IMG-D01–D16, contrato, matriz de 24 casos y tareas). Diseño técnico:
[ADR 0010](docs/adr/0010-image-viewing.md). Alcance:
[roadmap](docs/plan/2026-10-19-roadmap-de-versiones.md#próxima-entrega-v08--vista-de-imágenes).
Leer también [ADR 0002](docs/adr/0002-local-file-safety-and-resource-budgets.md),
`CONTEXT.md`, `ARCHITECTURE.md` y `CLAUDE.md` antes de cada tarea. IMG-0 (plan) está
completada y archivada.

- [x] **IMG-1 — Núcleo: lectura acotada, detección y cabeceras.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-1--núcleo-lectura-acotada-detección-y-cabeceras). Extraer la primitiva de bytes acotados de `blob.rs`; módulo `image` con firmas, dimensiones, techo de 40 MP y animación. Casos 1–10. Las cabeceras se leen con parsers pequeños y acotados; no se incorporó `imagesize` porque la dependencia no está disponible en la caché local y el registro de crates no es accesible en este entorno. Las pruebas de red del crate no pudieron ejecutarse por la restricción del sandbox sobre sockets locales. → `feat(core): classify image bytes and read their headers`
- [x] **IMG-2 — Núcleo: fuentes de comparación.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-2--núcleo-fuentes-de-comparación). Versión anterior/guardada de commit, índice/disco y stash. Casos 11–18 y 23. Depende de IMG-1. Pruebas dirigidas de imagen, worktree y stash aprobadas; lectura de disco comparte resolución confinada y guardas de revisión. → `feat(core): read image versions from commits, local changes and stashes`
- [x] **IMG-3 — IPC y bindings.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-3--ipc-y-bindings). Tres comandos autorizados, wrappers y bindings. Caso 20. Depende de IMG-2. Invariantes y bindings pasan; prueba IPC confirma allowlist y respuesta de imagen de commit. La medición de 32 MiB release consta en IMG-8. → `feat(ipc): expose authorized image reads for commits, local changes and stashes`
- [x] **IMG-4 — Estado frontend.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-4--estado-frontend). Consultas con caché acotada, claves por raíz y `shouldProbeImage`. Caso 24. Depende de IMG-3. Hooks sin reintentos/focus-refetch, caché de 15 s y revisión local en clave. Typecheck y pruebas dirigidas (9) aprobados. → `feat(images): add image queries with bounded cache retention`
- [x] **IMG-5 — Componente `ImageCompare`.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-5--componente-imagecompare). Una/dos versiones, lado a lado, deslizador, ajuste, animación, errores, i18n. Caso 21. Depende de IMG-4. Componente accesible con MIME por formato detectado, SVG aislado en `<img>`, control de animación y reduced-motion, expansión acotada y catálogo EN/ES. 31 pruebas de componente/i18n, typecheck y ESLint focalizados aprobados. → `feat(images): add the image comparison viewer component`
- [x] **IMG-6 — Integración en los cuatro lectores.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-6--integración-en-los-cuatro-lectores). Modo imagen en `FileDiffView` (commit, historial, cambios locales) y `StashFileView`, sin duplicar. Solo aparece al confirmar una imagen; binarios compatibles se abren directamente en modo imagen. Preserva diff/archivo y limita la expansión al lado elegido. Typecheck y ESLint aprobados; pruebas dirigidas existentes: 30. → `feat(images): show images in the commit, history, local changes and stash viewers`
- [x] **IMG-7 — Accesibilidad, i18n y E2E.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-7--accesibilidad-i18n-y-e2e). Fixture sintético con PNG válidos de dimensiones distintas, SVG hostil, GIF animado, rename/delete, cambios de índice/disco y stash; sin binarios versionados. Componentes EN/ES, teclado, reduced motion y aislamiento SVG cubiertos. E2E nativo macOS/WebKit pasa en historial a 940×600, tema claro/oscuro, inglés/español; capturas revisadas. Prueba unitaria agrega comparación de imágenes exactas del stash. Linux/Windows nativos y lector real siguen sin verificar. → `test(e2e): cover image viewing across sources, themes and languages`
- [x] **IMG-8 — Verificación final y documentación.** [Plan](docs/plan/2026-11-15-v0.8-implementacion.md#img-8--verificación-final-y-documentación). Verificación reproducible en [`docs/verification/v0.8.md`](docs/verification/v0.8.md), CHANGELOG `Unreleased`, documentos de producto y ADR 0010 aceptado. Sin bump ni release. Medición release: clasificación/base64 de 2 MiB 1.751 ms; lectura y serialización IPC de 32 MiB 133.437 ms. → `docs(images): record v0.8 verification and update product docs`

### Gates externos y seguimiento histórico (sin evidencia)

Verificaciones que no se pudieron ejecutar o documentar; conservan su plan de origen y no
bloquean el desarrollo de v0.8.

- [ ] **GRF-5 — Verificación de v0.4 (gate externo).** Origen:
      [roadmap, v0.4](docs/plan/2026-10-19-roadmap-de-versiones.md#entrega-de-referencia-v04-plan-histórico)
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

v0.8 vista de imágenes → v0.9 contribuyentes/releases → v0.10 proveedores →
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
