# QA CR-17: Sidebar y detalle central de releases

**Veredicto: PARTIAL.** Revisión independiente de UIR-01–UIR-09 contra `docs/plan/2026-11-23-v0.9-sidebar-release-inspection.md` y el diff desde baseline `d5ca8dc`, en rama `dev`. Checks Rust/frontend, la suite E2E más reciente y las capturas archivadas respaldan el cambio. UIR-03 y UIR-06 ahora cuentan con evidencia directa automatizada, incluida la suite E2E sintética v0.9.0. El veredicto general sigue PARTIAL por límites de GitHub real, diálogos/plataformas y lector de pantalla.

## Paquete y contexto

Se recibió el plan ligero y el diff de CR-17. El checkout contiene además cambios ajenos al alcance (por ejemplo `.agents/`, `.codex/`, `SNAPSHOT.md`, `docs/audits/evidence/`, `docs/media/`, `install-backups/` y herramientas demo); se preservaron. Solo se actualizó este informe. `HEAD` se mantuvo en el baseline indicado; el cambio CR-17 está en el working tree. Aunque `cargo` no figura en el `PATH`, se ejecutó mediante `/Users/davidcardenas/.cargo/bin/cargo`.

## Suites

| Comando / evidencia | Resultado |
|---|---|
| `npm run test:coverage` | Ejecutado aquí, exit 0: 108 archivos y 999 tests pasaron. Statements 90.86%, branches 82.33%, functions 89.82%, lines 92.57%. |
| `npm test -- src/components/TagsReleasesPanel/ReleaseDetailView.test.tsx src/components/TagsReleasesPanel/releasePresentation.test.ts src/components/TagsReleasesPanel/markdownLinks.test.ts src/state/releaseNavigation.test.ts src/components/TagsReleasesPanel/TagsReleasesPanel.test.tsx src/components/AuthorPanel/AuthorPanel.test.tsx src/components/Sidebar/Sidebar.test.tsx` | Ejecutado aquí, exit 0: 7 archivos, 57 tests pasaron. |
| `npm run typecheck`, `npm run typecheck:e2e`, `npm run typecheck:node`, `npm run lint`, `npm run format:check`, `npm run build`, `git diff --check` | Ejecutados aquí en cadena; todos pasaron. Vite compiló 585 módulos. Queda el aviso no bloqueante de chunk principal de 766.49 kB minificado (límite sugerido 500 kB). |
| Corrida E2E anterior al rebuild v0.9.0 | Hubo una falla intermitente en `e2e/v05-filters-worktrees.spec.ts`; el rerun aislado pasó 4/4. La corrida completa más reciente se registra en la fila siguiente. Backend GitHub sintético. |
| `npm run test:e2e` (evidencia recibida, build v0.9.0) | La suite completa macOS/WebKit terminó exit 0: 12 specs, 36 tests. Autores/releases 4/4; incluye segundo release de fixture, transición A→B→A con notas/assets aislados, cierre Escape con foco devuelto a la fila y descarga sintética. Backend GitHub sintético. No ejecuté esta corrida E2E. |
| E2E visual | Revisé las 11 capturas archivadas bajo `docs/verification/evidence/v0.9-cr17/`: EN/ES × claro/oscuro del sidebar a 940×600 y 1440×900, más lista, detalle y descarga EN/claro a 1440×900. Jerarquía consistente, chip “Most recent”/“Más reciente” y sin overflow horizontal; a 940 el encabezado del detalle acomoda título y fecha en dos líneas. |
| Impeccable detector | Evidencia recibida: detector de literales UI reportó `[]`. |
| `/Users/davidcardenas/.cargo/bin/cargo fmt --all --check` | Ejecutado aquí, exit 0. |
| `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets --all-features -- -D warnings` | Ejecutado aquí, exit 0. |
| `/Users/davidcardenas/.cargo/bin/cargo test --workspace` | Ejecutado aquí, exit 0. Tauri: 79 passed; core: 141 passed, 1 ignored; integraciones pasaron (incluidos actions 18, authors 17, stash 30+24, entre otras); doc-tests pasaron. Conteo del core incluye 142 ejecutados/recogidos, 141 passed y 1 ignored. |
| `python3 .dcl/dcl.py doc-check` | Ejecutado aquí, exit 0: `doc-check: todo en orden`. |

## Matriz UIR-01–09

| Caso | Resultado QA y evidencia |
|---|---|
| UIR-01 | **Acreditado en frontend, con límite de E2E.** La suite aprobada incluye lista compacta, selección y separación de releases respecto de referencias Git. E2E reportado pasó; no se confirma con interacción manual adicional. |
| UIR-02 | **Parcial.** Tests aprobados para apertura central, adjuntos, descarga explícita y Markdown con HTML/imágenes remotas inactivos. La inspección de captura confirma composición central. No se verificaron de forma nativa todas las consultas/estados ni ausencia de descarga de binarios mediante traza de red. |
| UIR-03 | **Acreditado en E2E sintético y estado frontend.** E2E v0.9.0 selecciona releases 91001→91003→91001, comprueba que notas y assets vuelvan a coincidir con el release activo, cierra con Escape y verifica foco en la fila. Tests de estado preservan el contexto Git y la exclusión con stash; queries llevan clave por repositorio/root. No es una prueba de cambio entre dos repositorios/pestañas reales ni lector de pantalla. |
| UIR-04 | **Acreditado para la lógica de presentación probada.** Tests aprobados cubren fechas ordenadas/desordenadas, empate, fecha ausente/inválida, lista vacía y solo prereleases; la UI anuncia caché y truncamiento. Los casos ejecutados son sintéticos. |
| UIR-05 | **Acreditado por pruebas automatizadas.** Las tres suites dirigidas pasaron 39/39. Incluyen round-trip al restaurar `reference_tree_preferences` con Autores/Releases y roots distintos; prueban conservar la selección/énfasis del autor al plegar, y plegar/expandir todo con estado durable actualizado. E2E reciente pasa 12 specs/36 tests. La persistencia de sección cubre serialización/restauración del workspace; el reinicio de una app instalada no se comprobó manualmente. |
| UIR-06 | **Acreditado en suites automatizadas; backend sintético.** Tests dirigidos frontend (15/15) comprueban query por ID decimal, recuperación/discard de acceso, transferencia y cancelación, descarga explícita y IDs exactos. `cargo test --workspace release` pasó 54 tests Tauri/core: autorización, asset exacto, paginación/límites, errores, progreso, cancelación, sanitización, integridad y descarga atómica. E2E v0.9.0 descubre assets de dos releases aislados y completa una descarga sintética; CR-14b ya había verificado el contrato de progress/cancel/access-recovery en tests directos. No hubo GitHub live ni diálogo nativo operado manualmente; esta limitación se mantiene. |
| UIR-07 | **Acreditado por cobertura automatizada del recorrido.** La suite E2E macOS/WebKit más reciente pasó 12 specs/36 tests, incluidos filtros/worktrees, navegación de Autores/Releases y stash; la suite unitaria de Sidebar pasó y cubre búsqueda/limpieza, HEAD, grupos/carpetas, contadores, visibilidad/deshacer y menús. La corrida anterior tuvo una falla intermitente en `v05-filters-worktrees`, que pasó en rerun aislado; la repetición completa posterior terminó exit 0. Backend GitHub sigue siendo sintético. |
| UIR-08 | **Acreditado visualmente.** Inspeccioné las 11 capturas archivadas: sidebar EN/ES × claro/oscuro a 940×600 y 1440×900, además de lista/detalle/descarga a 1440×900. Se conserva jerarquía, el detalle cabe sin overflow horizontal y el foco visible aparece en los estados capturados. Las capturas acreditan composición/estados estáticos; no verifican por sí mismas el retorno de foco como interacción. |
| UIR-09 | **Acreditado a nivel de pruebas frontend; integración nativa parcial.** Tests aprobados comprueban HTTPS y relativo, y rechazan HTTP, `javascript:`, `file:`, credenciales, URL malformada, caracteres de control y destinos sobre 8 KiB. También prueban activación explícita y error accesible/copiar. No se verificó personalmente el navegador del sistema en cada plataforma. |

## Hallazgos

- **P2 — Integración externa/nativa no verificada.** E2E usa backend GitHub sintético; las pruebas de Rust/frontend cubren contratos y fixtures, pero no acreditan GitHub live ni operación manual del diálogo nativo. UIR-03 tiene A→B→A sintético y Escape/foco en la fila; UIR-06 cubre contratos y descarga sintética. Lector de pantalla y diálogos Linux/Windows siguen como gates externos.

## Evidencia complementaria posterior a esta revisión

El 2026-11-23, después de cerrar esta revisión independiente, el bundle macOS 0.9.0 se
instaló y se probó contra GitHub real con el release publicado v0.8.0. Se abrieron notas y
Full Changelog en Chrome, se descargó el asset `.sig` y se repitió con un nombre elegido.
Ambos archivos de 420 bytes coincidieron por SHA-256 con el asset. La prueba encontró y
corrigió la falta de asociación del diálogo nativo con la ventana principal. Esta evidencia
complementaria reduce el límite de UIR-06 para macOS; no cambia el veredicto PARTIAL ni
cubre sobrescritura, Linux/Windows o lector de pantalla. Detalle: [seguimiento ARM64](v0.9-macos-arm64-followup.md).

## Límites y gates pendientes

No verificados en esta revisión: interacción con GitHub real para releases/adjuntos de esta versión, lector de pantalla real (`A11Y-LECTOR`), diálogo/renombrado en Linux y Windows, restauración tras reinicio de app instalada y prueba manual de destino de descarga. UIR-03 tiene verificación E2E A→B→A sintética con Escape/foco; UIR-06 tiene tests unitarios Rust/frontend y descarga E2E sintética, sin interacción live/nativa. La persistencia por raíz y expandir/plegar todo sí están cubiertos por tests; UIR-07 tiene cobertura automatizada unitaria y E2E. Rust, suites frontend, doc-check y la última suite E2E reportada pasan.

Gates propuestos al Mantenedor para incorporar en `TASKS.md` antes del cierre:

- **V09-VERIFY-CR17-LIVE-GITHUB:** probar contra GitHub real los metadatos y adjuntos de un release vigente; registrar requests, errores y descarga. El flujo contractual de errores/acceso/progreso/cancelación/reintento está cubierto por pruebas; esta puerta valida integración externa.
- **V09-VERIFY-CR17-UIR05-RESTART:** smoke test en app instalada tras cerrar/reabrir para confirmar persistencia por raíz; serialización/restauración, teclado, expandir/plegar todo y énfasis ya cuentan con pruebas automatizadas.
- **V09-VERIFY-CR17-UIR08:** verificar en interacción el retorno de foco y scroll EN/ES × claro/oscuro a ambos tamaños; las 11 capturas archivadas acreditan los estados visuales, no el retorno interactivo.
- **A11Y-LECTOR:** ejecutar con lector de pantalla real y documentar sistema, lector y resultado.
- **V09-VERIFY-CR17-NATIVE-LINUX-WINDOWS:** verificar diálogo de destino/renombrado en ambas plataformas.
- **V09-VERIFY-CR17-ASSET-RESOURCES:** probar un asset grande y un release futuro para verificar límites y recuperación de recursos.
