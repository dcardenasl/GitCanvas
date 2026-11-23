# QA de CR-6a: panel de autores y navegación

**Veredicto: PARTIAL.** Las pruebas de componente cubren ahora el teclado, estados accesibles del DOM y secuencia de foco. La lectura con lector de pantalla real sigue sin verificarse y queda asignada al gate externo de CR-15 en `TASKS.md`.

## Alcance y evidencia

- Baseline de esta revisión: `3bf7dd35eeb8e51a4f003bb9906b932ce765deb1`.
- Commit revisado: `c22e4c1e67fb980c7cdfac8d0a4050c488d7e831` (`test(authors): verify keyboard navigation and focus access`), hijo directo del baseline.
- Alcance del plan: lista de autores con búsqueda, progreso del catálogo y navegación anterior/siguiente por teclado, con texto accesible.
- Criterio 13: navegar por autor, incluso a un commit no cargado, seleccionarlo y mostrarlo en el gráfico. Caso 36: paneles, teclado, lector de pantalla, progreso y cancelación; foco y estados anunciables.
- Sesión de QA: Claude Code autenticado mediante claude.ai Pro, modelo `claude-haiku-5-5`, esfuerzo medio, según `config/modelos.yaml`.
- Contexto ambiental: el checkout tenía `SNAPSHOT.md` modificado y varios elementos no rastreados antes de la revisión. Se dejaron intactos.

| Criterio | Evidencia | Resultado |
| --- | --- | --- |
| Lista, búsqueda y selección | Prueba de componente busca por correo y selecciona la identidad. El componente filtra por nombre y correo. | Verificado para búsqueda y selección; una prueba de búsqueda por correo. |
| Progreso y pausa/reanudación | Prueba comprueba progreso en estado `status`/`aria-live`, pausa entre trozos y continuación. | Verificado por prueba de componente. |
| Navegación por teclado en ambas direcciones | Las pruebas disparan Alt+Right y Alt+Left; ambas afirman dirección a `adjacentAuthorCommit` y llamada a `revealCommit` con el ID correspondiente. CR-5 cubre anterior/siguiente y paginación a commits no cargados. | Verificado en componente y estado. |
| Protección del campo de búsqueda | La prueba despacha Alt+Left y Alt+Right con el foco en el searchbox; ambos eventos quedan sin prevenir y no llaman a navegación ni revelado. | Verificado. |
| Estados accesibles del DOM | Prueba afirma etiqueta accesible del searchbox, `aria-pressed` de autores seleccionados/no seleccionados, `role="status"`, `aria-live="polite"` del progreso y `aria-keyshortcuts` de ambos botones. | Verificado en DOM/JSDOM. |
| Secuencia de foco por teclado | La prueba avanza con Tab por búsqueda, pausa/continuación, autores y botones anterior/siguiente, y afirma `document.activeElement` en cada paso. El componente define `:focus-visible`. | Secuencia verificada; apariencia del anillo no se comprobó visualmente. |
| Lector de pantalla real | `TASKS.md` traslada explícitamente la prueba con VoiceOver/NVDA/Orca al gate de accesibilidad de CR-15. | No verificado; gate externo pendiente. |
| Seleccionar/revelar commit en el historial | La prueba afirma que el ID de navegación se entrega a `revealCommit`; la transición selecciona el commit y solicita revelarlo en la tabla. | Verificado en estado de navegación. No se verificó visualmente el gráfico ni su atenuación, que corresponde a CR-6b. |

## Suites

| Comando | Resultado |
| --- | --- |
| `npm test` | Código 0. 102 archivos y 960 pruebas pasaron. |
| `npm run lint` | Código 0. ESLint terminó sin hallazgos. |
| `npm run typecheck` | Código 0. TypeScript terminó sin errores. |
| `python3 .dcl/dcl.py doc-check` | Código 0. Salida: `doc-check: todo en orden`. |
| `git diff --check 3bf7dd3..c22e4c1` | Código 0. Sin salida; no detectó errores de whitespace. |

## Hallazgos

No hay hallazgos bloqueantes de implementación o pruebas dentro del alcance funcional de CR-6a. El único punto sin verificar es la lectura con lector de pantalla real, que el plan de tareas mantiene explícitamente pendiente para CR-15.

## Límites y gates pendientes

- No se probó con VoiceOver, NVDA u Orca. Gate existente en `TASKS.md`: accesibilidad real y E2E bajo CR-15. No se propone un gate duplicado.
- No se verificó la apariencia visual del anillo de foco ni se hicieron capturas multiplataforma. La secuencia de foco y la regla CSS están comprobadas; la apariencia queda como límite visual.
- No se comprobó el atenuado del gráfico/tabla; corresponde a CR-6b.
