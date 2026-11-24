# GitCanvas: Snapshot

> Actualizado: 2026-11-23 · Lo escribe `cerrar-sesion`; lo lee `abrir-sesion` y `./dcl hoy`.
> Mantenerlo corto: esto no es un registro, es la forma de retomar en frío.

## Dónde quedé

v0.9.0 está publicada: PR #24 fusionado a `main` (`da54371`), tag anotado `v0.9.0` sobre ese commit y GitHub Release publicado (no draft, no prerelease). `latest.json` declara `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64` y `windows-x86_64`. El job aarch64 se canceló tres veces a los 15 minutos sin pasos registrados; pasó al reintentarlo solo (run `45262501399`, intento 2). `dev` está por delante de `origin/dev` con tres commits que no están en el release: `720dc31` y `20a3df5` (e2e de Linux) y `97748c7` (test de Windows). `97748c7` no tiene CI todavía porque el CI solo corre en PR a `main`. El test `pull_fetches_tags_for_new_commits_but_not_unrelated_remote_tags` fallaba a veces en Windows; ya no reproduce en local (18/18, 15 repeticiones), pero no está validado en Windows.

## Próximo paso

Domingo: (1) corregir la fila v0.9 de `ROADMAP.md` (sigue como «Planificada» y PR abierta) y decidir con David si el PR `dev → main` se abre ya para validar `97748c7`; (2) planificar v0.10 (múltiples proveedores) con el skill `plan-version`, carril L, y confirmar el alcance con David: GitLab en solo lectura, gitlab.com, una cuenta por proveedor; (3) implementar v0.10 por tareas, con `implement-task` y `commit-flow`, y QA independiente antes del release. Repositorios, cuentas y credenciales ya están delimitados en el roadmap.

## Bloqueos

(ninguno)

## Decisiones pendientes de David

- ¿Se abre el PR `dev → main` ahora o con la siguiente versión? Recomendación: con la siguiente versión, para no gastar un ciclo de CI solo por el fix.
- ¿Qué versión sigue, `0.9.1` (parche) o `0.10.0`? Recomendación: `0.9.1` si el alcance es solo estos fixes; `0.10.0` si entran funcionalidades nuevas.
- ¿Se registra en el radar el riesgo del test flaky de Windows? Recomendación: sí, con dueño y fecha de revisión.

## Verificado y no verificado

- Verificado (salida real): `doc-check` en orden; `release-check v0.9.0 --skip-git` en orden; PR #24 con cinco checks en verde sobre `720dc31` (run `45245942517`, Windows en intento 2); release `v0.9.0` publicado con `latest.json` que incluye `darwin-aarch64`; `cargo test -p gitcanvas-core --test actions` 18/18 y 15/15 repeticiones en macOS; `cargo clippy -D warnings` y `cargo fmt --check` limpios.
- No verificado: la firma del updater (`TAURI_SIGNING_PRIVATE_KEY` no está disponible en local y no se revisó su uso en el job); instalación y arranque de los instaladores en Linux y Windows; el test flaky en Windows con `97748c7`; el rechazo del validador sobre el cierre documental de v0.9.0 sigue citado en la descripción del PR y no tiene registro de cierre propio.

## Comandos para retomar

```bash
git branch --show-current
git log --oneline -5
git status -sb
gh release view v0.9.0 --json isDraft,publishedAt,url
gh run list --workflow quality.yml --limit 3
python3 .dcl/dcl.py doc-check
```
