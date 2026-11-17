# Protocolo de trabajo

Cómo se llevan los documentos de ejecución: `TASKS.md`, `ARCHIVES.md`, los planes por
versión, los ADR y los documentos de verificación. Complementa el
[protocolo del roadmap](protocolo-roadmap.md) (qué entra y en qué orden) y el
[protocolo de release](protocolo-release.md) (cómo se publica). Derivado del proceso de
GitCanvas, con carriles por tamaño y vigilancia de gates.

**Qué rige:** las reglas valen para todo lo nuevo. El contenido histórico no se reescribe
para cumplirlas; `dcl doc-check` aplica cada regla desde la versión configurada en
`primera_version_con_plantilla`.

## 0. Carriles por tamaño

El Planificador propone el carril y David lo confirma.

| Carril | Cuándo | Qué exige | Qué no exige |
|---|---|---|---|
| S | Arreglo, ajuste, dependencia | Tarea con ID en `TASKS.md`, un commit, línea de CHANGELOG si el usuario lo nota | Plan, matriz, verificación escrita |
| M | Mejora acotada dentro de una versión ya planificada | Plan ligero de una página (plantilla `plan-ligero.md`) y resultado de las suites en el PR | ADR, documento de verificación aparte |
| L | Una versión: capacidad principal nueva | Todo este protocolo | Nada se omite |

## 1. `TASKS.md`: trabajo pendiente o en curso

Contiene solo lo que falta o se está haciendo. No guarda estado de producto ni decisiones.

**Nace una cola** cuando una versión pasa de *Planificada* a *En curso*:

1. Existe el plan con su matriz de aceptación.
2. Se crea la sección `### vX.Y: <entrega>` con enlaces al plan, al ADR y al roadmap.
3. Cada tarea lleva un ID con prefijo propio de la versión (`IMG-1`, `ST-3`), estable para
   siempre, su dependencia y los casos de la matriz que cubre.
4. La flecha `→` es el mensaje exacto del commit que la cierra.

**Formato de línea de tarea** (lo leen también las herramientas de CiudadOS, no cambiarlo):

```
- [ ] **ID: Título corto.** Depende de: ... Casos: ... Archivos: ...
      → type(scope): subject in english
```

**Se trabaja** con estas reglas:

- Una tarea, un commit; se marca `[x]` en el mismo commit que la implementa.
- Si algo no estaba previsto, se anota bajo la tarea como `*Hallazgo durante la ejecución:*`.
- Una tarea cancelada se deja ~~tachada~~ con el motivo. Nunca se renumera ni se reusa un ID.
- Los IDs son únicos en todo el archivo.

**Se cierra** al publicar la versión, dentro del flujo de release y antes del commit
`chore: release`: la cola pasa a `ARCHIVES.md`, lo que quedó sin evidencia sube a un gate
(sección 7) y «Siguiente paso» apunta al plan de la versión que sigue.

## 2. `ARCHIVES.md`: lo completado, con su evidencia

Es un registro: se escribe una vez y no se edita, salvo para corregir un enlace roto.

- Una sección por versión publicada, con este encabezado, las más recientes arriba:
  `### vX.Y: <entrega> (<IDs>; publicada como vX.Y.Z)`
- Debajo: enlaces al plan, al ADR, a la verificación y a la release; los gates que quedaron
  abiertos; y las tareas con su estado, hallazgos y mensaje de commit.
- Al inicio hay un índice de secciones, que se regenera al archivar una versión.
- **Para agentes:** no se carga el archivo completo; se lee el índice y la sección pedida.
  Al superar los 150 KB se rota por versión mayor (`ARCHIVES-v0.md`, `ARCHIVES-v1.md`).

## 3. Cierre de versión: una sola lista

Antes del commit `chore: release vX.Y.Z`, en este orden:

1. **Auditoría:** último tag en `main`, `git log main..dev`, estado del CHANGELOG.
2. **Versión por SemVer**, confirmada con David.
3. **Manifiestos** del perfil, todos a la misma versión.
4. **CHANGELOG:** `[Unreleased]` pasa a `[X.Y.Z] (fecha)` y se abre uno vacío.
5. **README:** sección de última versión y características, si el perfil lo exige.
6. **Roadmap:** fila `Publicada`, cabecera y próxima entrega.
7. **`TASKS.md` y `ARCHIVES.md`:** cola archivada, índice regenerado, gates revisados.
8. **ADR y verificación:** el ADR pasa a «Accepted and implemented... Published in vX.Y.Z»; la
   verificación declara lo que no se pudo verificar.
9. **Commit `chore: release vX.Y.Z`** como último de `dev`, PR, merge sin squash, tag sobre
   `main` y comprobación del GitHub Release.

## 4. Plan por versión

`docs/plan/<fecha>-vX.Y-implementacion.md`. Lleva estas secciones, en este orden (se pueden
añadir otras, no quitar estas):

| Sección | Contenido |
|---|---|
| `## Origen y alcance vigente` | Roadmap, registro de alcance y lo que queda fuera |
| `## Contexto observado en el código` | Lo que ya existe y se reutiliza, con fecha |
| `## Decisiones` | Decisiones cerradas con ID (`XXX-D01...`), cada una con su motivo |
| `## Contrato técnico` | Interfaces, tipos, límites y errores |
| `## Matriz de aceptación` | Casos numerados que prueban cada decisión |
| `## Tareas y dependencias` | Tareas con ID, orden, casos que cubren y archivos |
| `## Riesgos y criterios de cierre` | Qué podría fallar y cuándo se considera terminada |

Un plan no contradice el roadmap. Una vez la versión está *En curso*, el plan solo se
actualiza para anotar hallazgos. Si una decisión del plan debe cambiar, se vuelve a David con
**una** pregunta y una recomendación; no se sustituye en silencio.

## 5. ADR

`docs/adr/NNNN-<tema>.md`, con numeración correlativa.

- **Cuándo:** decisión técnica con consecuencias duraderas o costosa de revertir (frontera de
  seguridad, formato persistido, contrato entre capas, dependencia). Una decisión de producto
  va al plan o al roadmap.
- **Secciones:** `Status` (o `Estado`), `Context`, `Decision`, `Consequences`.
- **Estados:** `Proposed` desde el plan; `Accepted` al empezar a implementar;
  `Accepted and implemented, fecha. Published in vX.Y.Z` al publicar;
  `Superseded by ADR NNNN` si otra decisión lo reemplaza.
- **No se reescribe una decisión aceptada.** Si cambia, se escribe un ADR nuevo que dice
  «Reemplaza el ADR NNNN», y el viejo solo cambia su línea de estado.

## 6. Documento de verificación

`docs/verification/vX.Y.md`. Lleva:

- `## Suites`: qué se ejecutó y su resultado, con comandos reproducibles.
- `## Límites y gates pendientes`: lo que **no** se verificó, dicho sin suavizarlo.

Regla de honestidad: no se declara verificado lo que no tiene evidencia escrita; una
comprobación omitida va en «Límites y gates pendientes» y nunca se infiere de otra.

## 7. Gates externos y deuda

Un gate es una verificación que no se pudo ejecutar (plataforma, lector de pantalla,
dispositivo). Vive en `TASKS.md` como `Vxx-VERIFY` con «**Pendiente, sin evidencia:**».

- Se abre al publicar la versión si su verificación dejó puntos pendientes.
- **Se cierra solo con evidencia escrita** en `docs/verification/`, no por antigüedad.
- **Revisión en cada release** con `dcl gate-report`: cada gate abierto con su edad en
  versiones. Uno con más de dos versiones sin avance exige una decisión explícita de David:
  programarlo, o aceptarlo como «no verificado» y anotarlo en Known limitations.
- Los gates no bloquean la versión siguiente, pero no se ocultan.

## Comprobación automática

`dcl doc-check` falla si: una versión *Publicada* conserva su cola en `TASKS.md` o hay IDs
repetidos; una *Publicada* desde la versión configurada no tiene su sección en `ARCHIVES.md`
o su índice enlaza a un encabezado inexistente; un ADR tiene un estado no permitido; un plan
o una verificación omite una sección obligatoria. `dcl gate-report` lista los gates vencidos.
