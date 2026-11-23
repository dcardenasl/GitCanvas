# QA de CR-9a: fuente de releases y errores tipados

**Veredicto: PASS** para los casos 20, 49, 50 y 56 en el entorno probado. Hay una discrepancia menor en el conteo de pruebas registrado en `TASKS.md`, detallada abajo; no altera la evidencia funcional.

## Alcance y evidencia

- Baseline: `1a6af93b1b05faa78cf38e66eaf4e97a9f8e1548`.
- Commit revisado: `3d074b89daa928e5a4a916b705df8ea23f1d7f7b` (`feat(core): identify the github release source and type access errors`), hijo directo del baseline.
- Plan: CR-D26 (selección y validación de origen), CR-D28 (errores aditivos), casos 20, 49, 50 y 56.
- Sesión de QA: Claude Code autenticado con claude.ai Pro, modelo `claude-haiku-5-5`, esfuerzo medio, según `config/modelos.yaml`.
- Entorno: macOS (Darwin). `cargo` no estaba en el PATH inicial; se usó `/Users/davidcardenas/.cargo/bin/cargo`.
- El checkout tenía `SNAPSHOT.md` modificado y archivos no rastreados antes de QA. Se dejaron intactos.

| Criterio | Evidencia | Resultado |
| --- | --- | --- |
| Caso 20: HTTPS ajeno a GitHub produce `UnsupportedSource` sin request con token | `releases::source::tests::rejects_ssh_non_github_and_invalid_repository_names` llama `select_source` con GitLab y obtiene `UnsupportedSource`. `select_source` solo inspecciona remotos/configuración, aplica `insteadOf` y valida; no importa ni invoca cliente HTTP o keychain. | Pasa por prueba directa y revisión del camino puro; no se hizo request ni se leyó token. |
| Caso 49: SSH, usuario o puerto producen `UnsupportedSource` | El test de origen rechaza SSH y formato SCP; el test existente de `is_github_https` rechaza userinfo, puerto personalizado, GitLab y hosts look-alike. `source_from_url` usa ese helper y `select_source` retorna `UnsupportedSource` cuando no queda candidato compatible. | Pasa por tests directos del selector/helper y revisión de composición. |
| Caso 50: traversal en `owner/name` se rechaza antes de cualquier request | La prueba de origen verifica que `source_from_url("https://github.com/owner/../repo.git")` no produce fuente. Los tests existentes de `RepositoryName` rechazan `../../etc/passwd`, `a/../../b`, `owner/..` y segmentos extra. `select_source` aplica ese parser antes de entregar un origen; no realiza solicitudes. | Pasa. |
| Caso 56: `verify()` y `list_repositories()` conservan Auth/Network | `git diff --exit-code 1a6af93..3d074b8 -- crates/gitcanvas-core/src/github/api.rs` terminó con código 0 y sin salida. Los tests locales de API que verifican Auth/Network para `verify()` y éxito de `list_repositories()` siguen pasando. Los nuevos tipos de error son aditivos. | Pasa; ambas funciones permanecen sin cambios. |
| CR-D26: upstream, fallback a origin y `insteadOf` | Tests seleccionan el upstream GitHub de la rama sobre origin, usan origin cuando no hay upstream y validan la URL efectiva reescrita por `insteadOf`. | Pasa. |
| CR-D28: serialización aditiva | `release_errors_serialize_as_additive_typed_kinds` comprueba la forma serializada de las nuevas variantes; bindings, catálogos y resumen frontend incluyen `UnsupportedSource` y los demás tipos añadidos. | Pasa. |

## Suites

| Comando | Resultado |
| --- | --- |
| `/Users/davidcardenas/.cargo/bin/cargo test --workspace` | Código 0. `gitcanvas`: 64 pasaron; `gitcanvas-core`: 97 pasaron, 1 ignorada; integraciones y doc-tests pasaron. La prueba ignorada es el benchmark de 10.000 commits de `file_history`, ajeno a CR-9a. |
| `/Users/davidcardenas/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` | Código 0. Sin advertencias. |
| `/Users/davidcardenas/.cargo/bin/cargo fmt --all -- --check` | Código 0. Sin cambios requeridos. |
| `npm test` | Código 0. 102 archivos y 963 pruebas pasaron. |
| `npm run lint` | Código 0. ESLint terminó sin hallazgos. |
| `npm run typecheck` | Código 0. TypeScript terminó sin errores. |
| `python3 .dcl/dcl.py doc-check` | Código 0. Salida: `doc-check: todo en orden`. |
| `git diff --check 1a6af93..3d074b8` | Código 0. Sin salida; no detectó errores de whitespace. |
| `git diff --exit-code 1a6af93..3d074b8 -- crates/gitcanvas-core/src/github/api.rs` | Código 0. Sin salida; `verify()`/`list_repositories()` no cambiaron. |

## Hallazgos

**H1, resuelto en el cierre documental:** `TASKS.md` registraba 96 pruebas core pasadas y 1 ignorada; esta ejecución reportó 97 pasadas y 1 ignorada. La diferencia correspondía a seis pruebas nuevas de CR-9a (cinco de selección de origen y una de serialización de errores), no a pruebas faltantes. Se corrigió `TASKS.md` a 97 y se añadió el resultado de QA PASS.

## Límites y gates pendientes

- No se hizo ninguna llamada a GitHub real. Los tests de API existentes usan servidor local y el caso de origen no compatible se valida en una ruta que no ejecuta HTTP ni consulta el keychain.
- No se ejecutó en Linux ni Windows; esta evidencia corresponde a Darwin. Gate propuesto: **V09-VERIFY-CR9A-PLATFORMS**, aportar el resultado de CI multiplataforma antes de cerrar la matriz de release.
- No queda trabajo pendiente por el desfase de conteo; quedó corregido en `TASKS.md`.
