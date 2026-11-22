# QA de CR-5: estado frontend de autores

**Veredicto: PASS para el alcance de estado frontend de CR-5.**

## Alcance y evidencia

- Criterio revisado: caso 13, anterior/siguiente por autor, incluido saltar a un commit no cargado; el estado debe permitir seleccionar ese commit.
- Baseline de esta revisión: `5a1eb68`.
- Commit revisado: `a5656e2` (`test(authors): assert previous commit navigation`), hijo directo del baseline.
- La nueva prueba en `src/state/authors.test.tsx` navega desde `c` en la segunda página con dirección `previous` y afirma que devuelve `b`, el vecino existente de la primera página.
- La cobertura previa prueba dirección `next`, carga de un commit en una página no cargada, ID actual en una página posterior, límites primero/último, ID desconocido, selección aislada por raíz, acumulación del catálogo y recuperación desde cursor obsoleto.
- Contexto ambiental: el checkout contiene archivos no rastreados ajenos al diff. Se dejaron intactos.

| Caso | Evidencia | Resultado |
| --- | --- | --- |
| Vecino anterior existente entre páginas | `authors.test.tsx`: `c` → `previous` produce `b`. | Pasa. |
| Vecino siguiente y commit no cargado | La prueba carga otra página al navegar desde `b` hacia `c`. | Pasa. |
| Encontrar ID actual en páginas posteriores | La prueba localiza `c` en la segunda página y obtiene `d`. | Pasa. |
| Límites e ID desconocido | Las pruebas comprueban `null` antes del primero, después del último y para ID no perteneciente al historial. | Pasa. |
| Selección aislada por raíz | La prueba mantiene selecciones distintas para `/repo/a` y `/repo/b`. | Pasa. |
| Catálogo paginado | Pruebas cubren acumulación de conteos delta y reinicio ante `StaleCursor`. | Pasa. |

## Suites

| Comando | Resultado |
| --- | --- |
| `npm test` | Código 0. 101 archivos y 954 pruebas pasaron. |
| `npm run lint` | Código 0. ESLint terminó sin hallazgos. |
| `python3 .dcl/dcl.py doc-check` | Código 0. Salida: `doc-check: todo en orden`. |
| `git diff --check 5a1eb68..a5656e2` | Código 0. Sin salida; no detectó errores de whitespace. |

## Hallazgos

No hay hallazgos pendientes para el estado frontend de CR-5. La última prueba cubre el retorno de un vecino anterior existente que faltaba en la revisión previa.

## Límites y gates pendientes

- No se probó que la UI seleccione el commit ni que lo muestre visualmente en el gráfico. CR-5 cubre el estado; la integración del panel/navegación y gráfico corresponde a CR-6a/CR-6b y debe verificarse en el QA de esas tareas.
- No se verificaron plataformas, lector de pantalla ni dispositivos; no aplican al estado frontend aislado de CR-5.
- Gate task-level `V09-VERIFY-CR5-AUTORES`: cerrado con la evidencia de navegación anterior, siguiente, paginación y selección por raíz de esta revisión. La verificación de la interfaz sigue pendiente para CR-6a/CR-6b.

