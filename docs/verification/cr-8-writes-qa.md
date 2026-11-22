# QA del gate V09-VERIFY-CR8-WRITES

**Veredicto técnico: PASS bajo la interpretación de CR-D22 documentada aquí.** La auditoría reproducible compara el estado Git y el árbol de trabajo alrededor de las rutas de inspección de v0.9 y verifica la lista cerrada de escrituras de caché. Las acciones con escritura intencional tienen pruebas propias y quedan fuera del subcaso de no mutación. El Validador pidió confirmación explícita de David sobre esta delimitación; el cierre formal de `V09-VERIFY-CR8-WRITES` permanece pendiente hasta recibirla.

## Alcance y evidencia

CR-D22 limita este gate a las acciones de inspección y releases de v0.9: no deben mutar `.git` ni el árbol de trabajo. Las únicas escrituras permitidas por el contrato —`fetch_tag`, el destino elegido para una descarga y la caché de releases— se verifican en sus casos específicos. `checkout`, `pull` y `push` son mutadores previos con efectos previstos; no se consideran lecturas ni se incluyen en caso 38 (casos 19 y 39).

| Área | Evidencia directa | Resultado |
|---|---|---|
| Lecturas exitosas | `side_effect_audit` toma snapshots de `.git` y del árbol de trabajo antes y después de historia, refs, árbol/diff/blob/imagen, historia de archivo, autores, worktree, stash, listado/caché de releases y resolución de assets. | Sin cambios en snapshot. |
| Errores y entradas hostiles | El mismo snapshot envuelve rutas inválidas y blob ausente, traversal de imagen, revisión de worktree obsoleta e ID de stash inexistente. | Sin cambios en snapshot. |
| Límite de escrituras de datos | El fixture inicia con directorio de datos vacío y comprueba que los únicos caminos creados son `releases/`, `releases/.cache.lock` y `releases/acme__project.json`. Las respuestas REST vienen de un servidor local y no contienen autorización. | Lista exacta satisfecha. |
| Escrituras permitidas | Pruebas focales separadas de `fetch_tag`, caché y descarga cubren creación selectiva/limpieza de refs, almacenamiento de caché y escritura/cancelación de destino, respectivamente. | Se auditan bajo sus casos; no se confunden con la invariante de solo lectura. |

## Suites

Ejecutadas en macOS:

| Comando | Resultado |
|---|---|
| `PATH=/Users/davidcardenas/.cargo/bin:$PATH cargo test --release -p gitcanvas-core --features e2e --test side_effect_audit` | PASS — 1 prueba de auditoría. |
| `PATH=/Users/davidcardenas/.cargo/bin:$PATH cargo clippy --release -p gitcanvas-core --features e2e --test side_effect_audit -- -D warnings` | PASS — exit 0, sin diagnósticos. |
| `python3 .dcl/dcl.py doc-check` | PASS — `doc-check: todo en orden`. |
| `git diff --check` | PASS — sin errores de whitespace en el diff documental. |

La revisión focal anterior registró además: `fetch::tests` 5/5, listado de releases 11/11, caché 6/6, descarga 11/11, comandos de releases 6/6 e invariantes de comandos 4/4. La prueba IPC de `fetch_tag` se revisó en QA CR-12. Estos resultados no son una corrida nueva de las suites completas en esta actualización.

## Límites y gates pendientes

- No se consultó GitHub real: el servidor REST del snapshot corre en loopback.
- El snapshot cubre el fixture de núcleo, no un recorrido completo de la interfaz ni la invocación del diálogo nativo de guardar.
- El fixture es un repositorio ordinario; no se probó un linked worktree para esta auditoría.
- La comparación conserva rutas, bytes y objetivos de symlinks; no compara metadatos de permisos, ownership o timestamps.
- `checkout`, `pull` y `push` quedan excluidos de la afirmación de no mutación porque son operaciones mutadoras con contratos propios. Tampoco se afirma que el snapshot cubra archivos globales fuera de `.git`, del árbol de trabajo y del directorio de datos de releases.
- Las verificaciones de este informe no cierran gates de GitHub real, diálogo/UI ni matriz de plataformas. El gate `V09-VERIFY-CR8-WRITES` sí queda cerrado para el caso 38 bajo el alcance explicitado arriba.
