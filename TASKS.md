# TASKS — GitCanvas

> Fuente de verdad para el trabajo pendiente. El plan rector de H2 está en
> [`docs/plan/2026-10-04-plan-de-endurecimiento.md`](docs/plan/2026-10-04-plan-de-endurecimiento.md);
> el plan general está en [`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md).
> Convenciones y contexto para sesiones nuevas: [`CLAUDE.md`](CLAUDE.md).
> Tareas completadas: [`ARCHIVES.md`](ARCHIVES.md).

**Estado al 2026-10-05:** 43 de las 46 tareas H2 están completadas y archivadas en
[`ARCHIVES.md`](ARCHIVES.md); quedan H2-25, H2-42 y H2-45. De las completadas, 35 tienen
un commit dedicado; H2-34–41 se integraron y verificaron juntas en `437ff07` porque sus
cambios de frontend, IPC, bindings, core y pruebas se cruzan. H2-45 debe registrar esta
excepción a la regla de commit individual y cerrar la trazabilidad. El release v0.1.0
sigue abierto: PR #1 está abierta y R-4, R-5 y R-6 están pendientes.

**Estado del checkout:** la PR #1 sigue en el SHA remoto `7f24bb6`; el checkout `dev` tiene
commits locales aún no publicados y el working tree está limpio. La PR aún no evalúa esos
commits. No asumir que estén integrados en la PR; antes de editar, inspeccionar `git status`,
el historial y la evidencia de abajo.

## Siguiente paso

Retomar **H2-25**: la allowlist, el arranque local y E2E en macOS ya se verificaron. Para
cerrarla, hace falta que una corrida de `quality` evalúe el código actual y pase E2E en
Linux, macOS y Windows; los runs remotos anotados en la tarea son de un SHA anterior y
fallaron antes de ejecutar pasos, así que no cuentan como evidencia. Luego, cerrar H2-42
con evidencia de CI multiplataforma y por último reconciliar commits y trazabilidad en
H2-45. La nueva evidencia requiere actualizar la PR desde `dev`; pedir autorización explícita
antes de publicar los commits locales. El release sigue su flujo separado de `CLAUDE.md`.

Antes de empezar, revisar `git status`: el working tree puede incluir cambios de varias
tareas. Comparar cada cambio con los criterios de aceptación y la evidencia de esta lista.
Mover una tarea a [`ARCHIVES.md`](ARCHIVES.md) solo cuando todos sus criterios y su
verificación estén completos; registrar su commit dedicado cuando corresponda.

## Cola de trabajo

1. **H2-25 — Permisos y validación multiplataforma.** Obtener una corrida de CI sobre el
   código vigente; confirmar arranque y E2E en Linux, macOS y Windows. No cerrar con los
   resultados antiguos documentados en la tarea.
2. **H2-42 — Suite E2E.** Dos corridas locales en macOS pasaron sin reintentos (4 specs/8
   tests cada una). Completar evidencia CI Linux/Windows y mantener visible el warning
   conocido de `@wdio/tauri-service`.
3. **H2-45 — Cierre H2.** Reconciliar H2-34–41 con el historial sin perder cambios;
   cerrar conteos, evidencia integrada y divergencias solo cuando las tareas previas estén
   cerradas. El bloque H2-34–41 está integrado en `437ff07`, no en ocho commits individuales;
   dejar esta desviación explícita. Esperar CI actual en Linux, macOS y Windows para H2-25 y
   H2-42 antes de cerrar H2 o iniciar el release.
4. **R-4 a R-6 — Release independiente.** Seguir `CLAUDE.md`; R-4 requiere CI verde y
   aprobación explícita de David antes del merge.

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

## Fase H2 — Endurecimiento post-auditoría

Plan rector: [`docs/plan/2026-10-04-plan-de-endurecimiento.md`](docs/plan/2026-10-04-plan-de-endurecimiento.md).
Leer el contexto, los hallazgos y los criterios de aceptación de la tarea antes de
implementarla; validar hallazgos en el código y registrar aquí si no se reproducen. Las 43
tareas cerradas están en
[`ARCHIVES.md`](ARCHIVES.md). Los commits `c954492` (branding) y `7f24bb6` (grabador de
demo) ya existen en `dev` y no son pendientes.

**Convenciones:** trabajar en `dev`; una unidad verificable y un commit por tarea; usar el
mensaje indicado en cada tarea; actualizar su estado y evidencia en el mismo commit de
implementación. Actualizar `CHANGELOG.md` solo para `feat`, `fix` o `perf`. No publicar a
`main` desde esta fase: la publicación corresponde a `/release` y requiere aprobación de
David.

- [ ] **H2-25 — Reducir permisos Tauri a los usados.** Reemplazar `core:default` por
      `core:event:default` y `dialog:allow-open`; confirmar arranque y E2E multiplataforma.
      *Implementación parcial (2026-10-05):* `capabilities/default.json` ya concede solo
      `core:event:default` y `dialog:allow-open`, coherente con el uso de eventos, comandos
      IPC de la app y selector nativo de carpetas. `quality.yml` ahora ejecuta la suite E2E
      en Linux, macOS y Windows, usando Xvfb solo en Linux; las capturas usan `os.tmpdir()`
      para no asumir `/tmp` en Windows. Se añadió un test de regresión que exige que la
      allowlist sea exactamente esos dos permisos. El JSON y los usos se verificaron por
      inspección estática. *Verificado en sandbox aislado y offline:* `cargo test -p gitcanvas
      --lib default_capability_contains_only_required_permissions --offline --locked` (1 test
      passed; reejecutado en el working tree actual el 2026-10-05, 1 passed). *Smoke local
      (2026-10-05):* la app arrancó con el código actual mediante `tauri dev`, usando
      identificador y `HOME` temporales para aislarla de la instalación abierta; Vite quedó
      listo y el proceso nativo siguió activo hasta su cierre limpio. Queda pendiente la
      evidencia E2E de CI en Linux, macOS y Windows. Las últimas ejecuciones remotas
      disponibles (2026-09-26, SHA
      `7f24bb6`) de [quality](https://github.com/dcardenasl/gitcanvas/actions/runs/36265828914)
      y [dev-check](https://github.com/dcardenasl/gitcanvas/actions/runs/36265828257)
      fallaron antes de registrar pasos y GitHub no tiene logs (`log not found`); no prueban
      el estado del código ni cuentan como resultado multiplataforma. La PR sigue apuntando
      a `7f24bb6`; el checkout local de `dev` contiene commits y cambios posteriores que CI
      todavía no evaluó. El E2E local macOS ha pasado dos veces con `specFileRetries: 0`
      (4 specs/8 tests por corrida), pero no sustituye la evidencia CI en los tres sistemas.
      → `chore(tauri): narrow application capabilities`

### Calidad de pruebas

- [ ] **H2-42 — Hacer E2E determinista y relevante.** Helper `waitForHistory()`, quitar
      `browser.pause`, usar `os.tmpdir()`, retirar/fusionar specs sin aserciones, desacoplar
      `local-changes` y reducir reintentos conforme a evidencia.
      *Progreso (2026-10-05):* helper común adoptado por los specs de regresión; se
      eliminaron todas las pausas fijas de `e2e/`. `audit.spec.ts` se retiró porque solo
      imprimía observaciones; `screenshots.spec.ts` pasó a `e2e/manual/`, fuera del glob CI,
      conservando capturas mediante esperas observables. `local-changes` recibe por el runner
      un repositorio temporal mínimo propio e ignora `GITCANVAS_E2E_REPO`, evitando modificar
      por accidente el repositorio del usuario. `npm run typecheck:e2e`, ESLint de E2E,
      Prettier y `bash -n scripts/run-e2e.sh` pasan en sandbox aislado. En la revisión
      (2026-10-05) se encontró que un
      `GITCANVAS_E2E_FIXTURE` heredado sin procedencia confiable podía usarse como destino
      de escritura y borrado. `wdio.conf.ts` ahora exige que el hand-off apunte a un hijo
      directo de `os.tmpdir()` con marcador aleatorio dentro de `.git`; la creación limpia
      el temporal ante fallos y el cierre solo elimina un fixture cuyo marcador y token
      coinciden. El token debe tener el formato de UUID y el marcador su tamaño exacto
      antes de leerlo, para rechazar entradas malformadas y evitar lecturas sin límite.
      Cualquier `GITCANVAS_E2E_REPO` externo sigue ignorado en el caso
      `local-changes`. *Verificado (2026-10-05):* `npm run typecheck:e2e` y
      `prettier --check wdio.conf.ts` pasan. `npm run test:e2e:run` pasó en macOS usando
      binario E2E con `HOME` e identificador Tauri temporales: los cuatro specs CI
      (`collapse`, `commit-tree`, `critical-path`, `local-changes`) aprobaron sus 8 tests.
      La spec `local-changes` ahora comprueba el contrato de `FileDiffView`: conserva la
      selección y muestra el error localizado cuando un archivo staged desaparece. Sondas
      de comportamiento confirman que el runner no reutiliza una ruta heredada aun cuando
      su marcador y token tienen formato válido, deja intacto ese directorio no propio y
      elimina su fixture temporal al cerrar.
      La validación del hand-off worker conserva los controles de IPC/ID de WDIO y el
      marcador; la sonda previa confirmó que el worker reutiliza el fixture creado por el
      runner. `@wdio/tauri-service` todavía registra un warning no fatal al limpiar mocks
      después de perder el `sessionId`. El código upstream en `afterSession` intenta restaurar
      mocks sin comprobar si la sesión sigue activa; la última versión publicada consultada
      (1.4.0, 2026-10-05) mantiene ese comportamiento. Se deja visible para reevaluarlo al
      actualizar el servicio, sin silenciar otros diagnósticos.
      ([paquete](https://www.npmjs.com/package/%40wdio/tauri-service),
      [código upstream](https://github.com/webdriverio/desktop-mobile/blob/main/packages/tauri-service/src/service.ts)).
      Se corrigió además la comparación de rutas canónicas de macOS (`/var` frente a
      `/private/var`), que impedía limpiar fixtures propios.
      `specFileRetries` quedó en 0: cada spec corre en su propio proceso WDIO, la ventana se
      selecciona antes de consultar elementos y los tests esperan estado observable. Dos
      corridas completas consecutivas en macOS pasaron sin reintentos (4 specs/8 tests cada
      una; compilación aislada con `HOME` e identificador Tauri temporales). El warning no
      fatal de `@wdio/tauri-service` al limpiar mocks sigue visible después de cada sesión.
      Queda pendiente evidencia CI Linux y Windows. Los checks remotos más recientes
      consultables ([quality](https://github.com/dcardenasl/gitcanvas/actions/runs/36265828914),
      2026-09-26, SHA `7f24bb6`) fallaron sin pasos ni logs; no evalúan el código actual.
      → `test(e2e): replace fixed waits with observable conditions`
### Documentación y cierre

- [ ] **H2-45 — Cerrar trazabilidad de H2.** Revisar conteo/estado de tareas, documentar
      divergencias verificadas frente al plan, commits ya registrados y evidencia final.
      Ejecutar la verificación local definida por el plan y las comprobaciones manuales
      aplicables; registrar fallos ambientales sin declararlos verdes.
      *Reconciliación de commits (2026-10-05):* H2-33 quedó en `03077dd` (`perf(core): bound
      fingerprints and watcher debounce`), H2-34–41 en el commit de integración `437ff07`
      (`refactor: consolidate audited hardening work`) y H2-43 en `5d47af3` (`chore(demo):
      isolate recorder tooling and document prerequisites`). H2-34–41 no tienen un commit
      individual por tarea; se conservaron juntas porque los cambios atraviesan componentes
      compartidos y contratos entre frontend, IPC, bindings, Tauri y core. El conteo debe
      distinguir los 35 cierres con commit dedicado de los 8 IDs cubiertos por el commit de
      integración. El working tree quedó limpio tras `437ff07`.
      *Evidencia integrada actual (2026-10-05):* pasaron `cargo fmt --all --check`,
      `cargo clippy --all-targets --all-features --offline --locked -- -D warnings` y
      `cargo test --workspace --offline --locked` (150 tests: 23 Tauri, 40 unitarios core y
      87 de integración). `npm run test:coverage` pasó 40 suites/343 tests con 94,75% de
      statements, 88,08% de branches, 94,05% de funciones y 95,85% de líneas. También
      pasaron `npm run typecheck`, `typecheck:e2e`, `typecheck:node`, `lint` y `format:check`.
      También pasaron `npm audit --omit=dev --audit-level=high` (sin vulnerabilidades),
      `cargo deny check` y `cargo audit`; `cargo audit` reportó 8 avisos permitidos de
      dependencias sin mantenimiento o un advisory de soundness configurados en la política.
      La primera ejecución completa detectó que `touch_if_cached` canonizaba la raíz pero
      no el repositorio, fallando bajo la ruta `/var` alias de macOS; ambos caminos ahora se
      canonizan y los 12 tests del cache y la suite workspace completa vuelven a pasar. La
      verificación repetida sobre el snapshot integrado `437ff07` pasó con Node 24 (40 suites,
      343 tests; cobertura: 94,75% statements, 88,08% branches, 94,05% funciones y 95,85%
      líneas), typecheck de app/E2E/Node, lint, formato, `cargo fmt`, `cargo test --workspace`
      (150 tests) y Clippy `-D warnings`. Node 20 del shell no cumple `engines >=22` y produce
      un fallo de arranque en undici/jsdom; no usarlo para validar. El smoke de arranque y dos
      corridas E2E de macOS también pasan. En el checkout actual también pasaron
      `npm audit --omit=dev --audit-level=high`, `cargo deny check`, `cargo audit` (8 avisos
      permitidos) y `npm run tauri build -- --ci` en macOS, que produjo `.app` y `.dmg`. La
      PR #1 sigue en `7f24bb6`, con checks fallidos del 2026-09-26; aún no hay CI sobre el
      código local. Falta validar H2-25/H2-42 en los tres sistemas antes de cerrar H2.
      → `docs(tasks): close post-audit hardening`

**Criterio de cierre:** H2-0 a H2-45 completadas o hallazgos explícitamente descartados
con evidencia; verificación local y pruebas manuales del plan registradas; docs y TASKS
sin divergencias. La publicación sigue el proceso `/release` por separado.

---

## 🔴 Pendiente — Release v0.1.0

> Ejecutado con el skill `/release`. Ver `CLAUDE.md` para el procedimiento completo.
> R-1 a R-3 están completadas y archivadas en [`ARCHIVES.md`](ARCHIVES.md).

- [ ] **R-4 — PR `dev → main`.** Abrir, esperar `quality` verde, **esperar aprobación de
      David**, y mergear con `--merge` (nunca squash ni rebase).
      *Estado remoto (2026-10-05):* [PR #1](https://github.com/dcardenasl/gitcanvas/pull/1)
      ya está abierta. El último `dev-check` y la matriz `quality` (2026-09-26, SHA
      `7f24bb6`) terminaron en fallo en los primeros 2–6 segundos, sin registrar pasos; GitHub
      no ofrece logs. No se puede inferir una causa de código ni aprobar el merge con esta
      evidencia. Cuando la rama del PR contenga los arreglos requeridos y CI genere nuevos
      resultados, esperar `quality` verde y aprobación de David antes del merge.

- [ ] **R-5 — Tag y GitHub Release.** `v0.1.0` solo sobre `main`; `release.yml` crea el
      Release extrayendo la sección del CHANGELOG. Nunca `gh release create` a mano.

- [ ] **R-6 — Actualizar la ficha del asset.** `docs/ASSET.md` y `docs/SNAPSHOT.md`:
      versión, repositorio, estado del build por componente y log de avances.
      → `docs(asset): record the v0.1.0 release in the asset sheet`
