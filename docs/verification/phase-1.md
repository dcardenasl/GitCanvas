# Verificación — Fase 1

Fecha: 2026-09-08. macOS arm64, Rust 1.98.1, libgit2 1.9.7 vendorizado.

## Exactitud

Los primeros 50 commits de `ci4-website-suite` coinciden, SHA por SHA, con
`git log --all --topo-order --format=%H -n 50`. Se incluyen todas las ramas porque
el graph debe mostrar también las divergentes. El repositorio de referencia se leyó
sin modificarlo.

Comando reproducible:

```sh
GITCANVAS_REFERENCE_REPO=/ruta/al/repositorio cargo test -p gitcanvas-core --test history_verification matches_git_log -- --ignored --nocapture
```

Fixtures temporales de git2 cubren validación canónica, worktrees, symlinks, repos
vacíos/bare/inválidos, historial lineal, merges de dos y cuatro padres, ramas
independientes, HEAD desprendido, el límite exacto de 500 commits, cambios de refs
entre páginas, tags de commits/blobs y tags anotados anidados. Los tests IPC usan el
registro y las capabilities reales, con respuestas JSON y errores estructurados.

## Rendimiento

Build `--release`, fixture temporal de 10.000 commits, 500 por página, 50 muestras.
La fixture se crea con git2; solo el escenario empaquetado ejecuta `git repack -ad`
en esa fixture descartable. No se ejecuta mantenimiento en repositorios del usuario.

| Almacenamiento / lector | p50 | p95 | máximo |
|---|---:|---:|---:|
| Objetos sueltos, sin caché | 363,05 ms | 555,01 ms | 1057,87 ms |
| Objetos sueltos, lector de la aplicación | 16,21 ms | 18,92 ms | 376,36 ms |
| Empaquetado, sin caché | 23,43 ms | 24,61 ms | 24,84 ms |
| Empaquetado, lector de la aplicación | 1,55 ms | 1,98 ms | 23,99 ms |

El p95 del lector usado por IPC cumple el presupuesto de 300 ms en ambos escenarios.
**No es una garantía de latencia en frío:** la primera lectura con 10.000 objetos
sueltos costó 376 ms. El revwalk topológico debe inspeccionar ancestros antes de
emitir la primera fila. El trabajo ocurre en `spawn_blocking`; no bloquea el hilo UI.
La interfaz debe mostrar el estado de carga desde el inicio. Discos, cargas y tamaños
diferentes requieren sus propias mediciones; no hay aserciones de tiempo en CI.

La caché conserva únicamente SHAs: máximo ocho snapshots y 100.000 commits en total,
con expulsión LRU. La clave incluye el path canónico y las raíces inmutables. Nunca
conserva un `git2::Repository`, y nunca mantiene su mutex durante operaciones Git.
Recorridos mayores se sirven sin conservar su snapshot, manteniendo el límite de caché.

```sh
cargo test --release -p gitcanvas-core --test history_verification report_history_latency -- --ignored --nocapture
```

## Build y observabilidad

Clippy del workspace con todos los targets/features y `-D warnings` limpio. Tests
del workspace en verde; los dos ensayos manuales anteriores están ignorados por defecto.
Bindings generados por el test de Tauri, nunca editados manualmente. TypeScript,
ESLint y formato verificados.

Se alineó `MACOSX_DEPLOYMENT_TARGET=11.0` para que Rust, OpenSSL y libgit2 usen el
mismo mínimo; la recompilación eliminó las advertencias del linker.

Tracing emite JSON diario en el directorio de datos de la aplicación, bajo `logs`,
con retención de siete archivos. Solo registra operación, duración y éxito, sin
payloads, paths, mensajes de commits ni credenciales. El runtime conserva el guard
para vaciar el escritor al cerrar.
