# GitCanvas: Snapshot

> Actualizado: 2026-11-17 · Lo escribe `cerrar-sesion`; lo lee `abrir-sesion` y `./dcl hoy`.
> Mantenerlo corto: esto no es un registro, es la forma de retomar en frío.

## Dónde quedé

CR-1 (identidades y `.mailmap`, casos 1 a 4 y 42) implementada y marcada en `TASKS.md`, commit `74dc02e` en `dev`. Es la primera tarea de v0.9. Hay `1` commit local sin subir: `dev` está un commit por delante de `origin/dev` (antes de CR-1 ambas coincidían en `1bbc3f0`). CR-2 a CR-16 sin empezar.

## Próximo paso

Implementar CR-2 (catálogo progresivo de autores) en `crates/gitcanvas-core/src/authors/catalog.rs`, según [el plan](docs/plan/2026-11-16-v0.9-implementacion.md#cr-2-núcleo-catálogo-progresivo): casos 5 a 9 y 41. Reutiliza `load_mailmap` y su `content_hash` para el cursor.

## Bloqueos

- (ninguno)

## Decisiones pendientes de David

- ¿Subir `dev` a `origin`? Recomendación: sí, cuando quieras; el CI de `quality.yml` solo corre en PR a `main`, así que el push no gasta minutos.
- ¿Debe `AuthorIdentity` (listada en el contrato del plan) llevar conteo de commits? CR-1 solo creó `AuthorKey`; el conteo encaja en CR-2. Recomendación: definirla en CR-2 con el catálogo.

## Verificado y no verificado

- Verificado el 2026-11-17: `cargo test -p gitcanvas-core --test authors` con 11 pruebas en verde; `cargo test -p gitcanvas-core` completo en verde; `cargo clippy -p gitcanvas-core --all-targets` sin avisos; `npm test` (946 pruebas) y `npm run lint` en verde; `python3 .dcl/dcl.py doc-check` en verde.
- No verificado: Windows (la prueba del `.mailmap` simbólico solo corre en Unix; el CI en Windows no se ha ejecutado para CR-1); lector de pantalla real (`A11Y-LECTOR`, aceptado como no verificado); el job `process-docs` aún no ha corrido en GitHub.
- Ojo local: en esta máquina `npm` es un alias de shell a `pnpm`, y el proyecto exige npm; ejecuta `command npm test` y `command npm run lint` para saltarte el alias.

## Comandos para retomar

```bash
git branch --show-current
git log --oneline -5
git status -sb
python3 .dcl/dcl.py doc-check
```
