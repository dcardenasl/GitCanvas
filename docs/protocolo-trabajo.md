# Protocolo de trabajo

Cómo se llevan los documentos de ejecución: `TASKS.md`, `ARCHIVES.md`, los planes por
versión, los ADR y los documentos de verificación. Complementa el
[protocolo del roadmap](protocolo-roadmap.md) (qué entra y en qué orden) y el flujo de
release de [`releasing.md`](releasing.md) (cómo se publica).

**Qué rige:** las reglas valen para todo lo nuevo. El contenido histórico no se reescribe
para cumplirlas; `src/docs/trabajo.test.ts` aplica cada regla desde la versión que la
introduce.

## 1. `TASKS.md`: trabajo pendiente o en curso

`TASKS.md` contiene solo lo que falta o se está haciendo. No guarda estado de producto ni
decisiones: eso es del roadmap, de los planes y de los ADR.

**Nace una cola** cuando una versión pasa de *Planificada* a *En curso* (ver el protocolo
del roadmap):

1. Existe el plan `docs/plan/<fecha>-vX.Y-implementacion.md` con su matriz de aceptación.
2. Se crea la sección `### vX.Y — <entrega>` con un enlace al plan, al ADR y al roadmap.
3. Cada tarea lleva un ID con prefijo propio de la versión (`IMG-1`, `ST-3`), estable para
   siempre, la dependencia de otras tareas y los casos de la matriz que cubre.
4. La flecha `→` es el mensaje exacto del commit que la cierra.

**Se trabaja** con las reglas ya vigentes, que no cambian:

- Una tarea, un commit; se marca `[x]` en el mismo commit que la implementa.
- Si algo no estaba previsto, se anota bajo la tarea como `*Hallazgo durante la ejecución:*`.
- Una tarea cancelada se deja `~~tachada~~` con el motivo. Nunca se renumera ni se reusa un ID.
- Los IDs son únicos en todo el archivo.

**Se cierra** al publicar la versión, dentro del flujo de release y antes del commit
`chore: release`:

1. La cola completa pasa a `ARCHIVES.md` (sección 2) y desaparece de `TASKS.md`.
2. Lo que quedó sin evidencia no se archiva como cerrado: sube a un gate (sección 7).
3. «Siguiente paso» apunta a preparar el plan de la versión que sigue.

Mientras una versión *Publicada* tenga su cola en `TASKS.md`, el test falla.

## 2. `ARCHIVES.md`: lo completado, con su evidencia

`ARCHIVES.md` es un registro. Se escribe una vez y no se edita, salvo para corregir un
enlace roto.

- **Una sección por versión publicada**, con este encabezado exacto, y las más recientes
  arriba:

  ```markdown
  ### vX.Y — <entrega> (<IDs>; publicada como vX.Y.Z)
  ```

- Debajo, en este orden: enlaces al plan, al ADR, a la verificación y a la release; los
  gates que quedaron abiertos; y las tareas con su estado, hallazgos y mensaje de commit.
- Se conserva el texto original de las tareas, incluidos los hallazgos.
- **Índice.** Al inicio hay un índice de secciones. Se regenera al archivar una versión.
- El contenido anterior a v0.8 conserva su formato; no se normaliza.

## 3. Cierre de versión: una sola lista

Antes del commit `chore: release vX.Y.Z`, en este orden. Cada punto remite a su protocolo.

1. **Auditoría:** último tag en `main`, `git log main..dev`, estado del CHANGELOG.
2. **Versión por SemVer**, confirmada con David.
3. **Manifiestos:** `Cargo.toml` (workspace), `Cargo.lock`, `package.json`,
   `package-lock.json` y `src-tauri/tauri.conf.json`.
4. **CHANGELOG:** `[Unreleased]` pasa a `[X.Y.Z] — fecha` y se abre uno vacío.
5. **README:** sección «Latest» y Features ([`releasing.md`](releasing.md#update-the-readme)).
6. **Roadmap:** fila `Publicada`, cabecera y próxima entrega
   ([protocolo del roadmap](protocolo-roadmap.md#al-publicar-una-versión)).
7. **`TASKS.md` y `ARCHIVES.md`:** cola archivada, índice regenerado, gates revisados
   (secciones 1, 2 y 7).
8. **ADR y verificación:** estado del ADR pasa a «Implemented … Published in vX.Y.Z»; el
   documento de verificación declara lo que no se pudo verificar (sección 6).
9. **Commit `chore: release vX.Y.Z`** como último de `dev`, PR, merge sin squash, etiqueta
   sobre `main` y comprobación del GitHub Release.

## 4. Plan por versión

`docs/plan/<fecha>-vX.Y-implementacion.md`. Desde v0.8 lleva estas secciones, en este orden
(se pueden añadir otras, no quitar estas):

| Sección | Contenido |
|---|---|
| `## Origen y alcance vigente` | Roadmap, registro de alcance y lo que queda fuera |
| `## Contexto observado en el código` | Lo que ya existe y se reutiliza, con fecha |
| `## Decisiones` | Decisiones cerradas con ID (`XXX-D01…`), cada una con su motivo |
| `## Contrato técnico` | Interfaces, tipos, límites y errores |
| `## Matriz de aceptación` | Casos numerados que prueban cada decisión |
| `## Tareas y dependencias` | Tareas con ID, orden, casos que cubren y archivos |
| `## Riesgos y criterios de cierre` | Qué podría fallar y cuándo se considera terminada |

Un plan no contradice el roadmap: si hace falta, primero cambia el roadmap y se registra.
Una vez la versión está *En curso* el plan se actualiza solo para anotar hallazgos.

## 5. ADR

`docs/adr/NNNN-<tema>.md`, con numeración correlativa.

- **Cuándo se escribe:** una decisión técnica con consecuencias duraderas o que costaría
  revertir (frontera de seguridad, formato persistido, contrato entre capas, dependencia).
  Una decisión de producto va al plan o al roadmap, no a un ADR.
- **Secciones:** `Status` (o `Estado`), `Context`, `Decision`, `Consequences`.
- **Estados:** `Proposed` desde el plan; `Accepted` al empezar a implementar;
  `Accepted and implemented — fecha. Published in vX.Y.Z` al publicar;
  `Superseded by ADR NNNN` si otra decisión lo reemplaza.
- **No se reescribe una decisión aceptada.** Si cambia, se escribe un ADR nuevo que dice
  «Reemplaza el ADR NNNN», y el viejo solo cambia su línea de estado.

## 6. Documento de verificación

`docs/verification/vX.Y.md`. Desde v0.8 lleva:

- `## Suites`: qué se ejecutó y su resultado (pruebas, tipos, lint, formato, auditorías,
  build y E2E), con comandos reproducibles.
- `## Límites y gates pendientes`: lo que **no** se verificó, dicho sin suavizarlo.

Puede tener secciones intermedias (rendimiento, capturas, instalación local). Regla de
honestidad: no se declara verificado lo que no tiene evidencia escrita; una comprobación
omitida va en «Límites y gates pendientes», nunca se infiere de otra.

## 7. Gates externos y deuda

Un gate es una verificación que no se pudo ejecutar (plataforma, lector de pantalla,
dispositivo). Vive en `TASKS.md` como `Vxx-VERIFY` con «**Pendiente, sin evidencia:**».

- Se abre al publicar la versión si su verificación dejó puntos pendientes.
- **Se cierra solo con evidencia escrita** en `docs/verification/`, no por antigüedad. Al
  cerrarlo, pasa a `ARCHIVES.md` con el enlace a la evidencia.
- **Revisión en cada release:** se lista cada gate abierto. Uno con más de dos versiones
  sin avance requiere una decisión explícita de David: programarlo, o aceptarlo como
  «no verificado» y dejarlo anotado en el README (Known limitations).
- Los gates no bloquean el desarrollo de la versión siguiente, pero no se ocultan.

## Comprobación automática

`src/docs/trabajo.test.ts` falla el build si:

- una versión *Publicada* conserva su cola en `TASKS.md`, o hay IDs de tarea repetidos;
- una versión *Publicada* desde v0.8 no tiene su sección en `ARCHIVES.md`;
- un ADR no tiene sección de estado, o su estado no es uno de los permitidos;
- un plan o una verificación desde v0.8 omite una de las secciones obligatorias.
