# QA de CR-6b: atenuado por autor

**Veredicto: PASS** para CR-6b. La corrección de pertenencia incompleta queda verificada por pruebas directas; la comprobación con lector de pantalla real sigue en el gate externo de CR-15.

## Alcance y evidencia

- Baseline de esta revisión: `9187717095c6f13083bc99cdd25b42d8012b7cbb`.
- Commit revisado: `467ebc0b62437da400d535a0ad8cf88200d44ea5` (`fix(authors): keep unknown commits neutral while paging`), hijo directo del baseline.
- Alcance: `GraphCanvas`, `CommitTable` y pruebas. El atenuado debe conservar todos los nodos/aristas y la geometría, y ofrecer señales distintas del color.
- Sesión de QA: Claude Code autenticado con claude.ai Pro, modelo `claude-haiku-5-5`, esfuerzo medio, según `config/modelos.yaml`.
- Contexto ambiental: `SNAPSHOT.md` ya estaba modificado y había archivos no rastreados ajenos al diff. No se tocaron.

| Criterio | Evidencia | Resultado |
| --- | --- | --- |
| IDs ausentes mientras la paginación está incompleta | `HistoryView` establece `authorCommitIdsComplete` solo cuando hay autor, la consulta tuvo éxito y `hasNextPage` es falso. `GraphCanvas.test.tsx` compara geometría y afirma cero elementos atenuados con el conjunto incompleto. `CommitTable.test.tsx` conserva las tres filas y no añade clase ni etiqueta “otro autor”. | Pasa. Los IDs ausentes se mantienen neutrales. Los IDs conocidos también conservan opacidad normal y no se atenúan. |
| IDs ausentes después de completar la paginación | Ambas pruebas vuelven a renderizar con `authorCommitIdsComplete`. Los IDs conocidos permanecen sin atenuar; los IDs ausentes reciben clase de atenuado y señal textual en la tabla. | Pasa. |
| Conservar nodos, aristas y geometría | `GraphCanvas.test.tsx` compara `cx/cy/r` y `d` antes/después en estado incompleto y completo; conserva cinco nodos y la cantidad de aristas. | Pasa en el fixture. |
| Señales aparte del color | Los elementos SVG atenuados usan trazo discontinuo. La tabla añade “otro autor” visible e incluido en el `aria-label` de la fila. | Pasa por prueba DOM e inspección de código. |
| Cierre del hallazgo previo de paginación | La prop de completitud evita clasificar la ausencia de un ID no cargado como autoría distinta. | H1 cerrado. |

## Suites

| Comando | Resultado |
| --- | --- |
| `npm test` | Código 0. 102 archivos y 962 pruebas pasaron. |
| `npm run lint` | Código 0. ESLint terminó sin hallazgos. |
| `npm run typecheck` | Código 0. TypeScript terminó sin errores. |
| `python3 .dcl/dcl.py doc-check` | Código 0. Salida: `doc-check: todo en orden`. |
| `git diff --check 9187717..467ebc0` | Código 0. Sin salida; no detectó errores de whitespace. |

## Hallazgos

No hay hallazgos bloqueantes dentro del alcance de CR-6b. La consulta conserva su paginación; la vista ahora espera a conocer su completitud antes de atenuar los IDs ausentes. Las pruebas cubren los estados incompleto y completo en gráfico y tabla.

## Límites y gates pendientes

- No se probó con VoiceOver, NVDA u Orca. Esta comprobación externa permanece en el gate de accesibilidad de CR-15, según `TASKS.md`; no se propone un gate duplicado para CR-6b.
- No se ejecutó una comprobación visual en dispositivos; la geometría se verificó por atributos DOM/SVG y los estilos por código/pruebas.
