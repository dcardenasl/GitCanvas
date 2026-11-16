# Protocolo del roadmap

Cómo se mantiene el [roadmap de versiones](../ROADMAP.md): cómo
entra una funcionalidad nueva, cómo se cambia el orden y qué se actualiza en cada
release. Complementa el flujo de release de [`releasing.md`](releasing.md).

## Quién decide

David decide el orden y el alcance. Quien trabaje en el proyecto (persona o asistente)
propone con una recomendación y el motivo; nunca reordena, renumera ni amplía una
entrega por inferencia. Toda decisión queda escrita en el
[registro de cambios de alcance](../ROADMAP.md#registro-de-cambios-de-alcance)
el mismo día en que se toma.

## Dónde vive cada cosa

| Documento | Responde a | Cambia cuando |
|---|---|---|
| Roadmap, tabla «Secuencia acordada» | Qué versión trae qué y en qué orden | Se decide un cambio de orden o alcance |
| Roadmap, «Reserva de futuras funcionalidades» | Ideas sin versión ni compromiso | Aparece una idea o se promueve |
| Roadmap, «Registro de cambios de alcance» | Por qué cambió algo | Cada decisión, sin borrar las anteriores |
| `docs/plan/<fecha>-vX.Y-implementacion.md` | Contrato, límites, casos y tareas de una versión | Al planificar esa versión |
| `docs/adr/` | Decisiones técnicas con consecuencias duraderas | Al aceptar una decisión |
| `TASKS.md` | Qué se ejecuta ahora y su evidencia | Durante la implementación |
| `docs/verification/vX.Y.md` | Qué se verificó y qué no | Al cerrar la implementación |

La tabla manda sobre el orden. Un plan de versión no puede contradecirla: si hace falta,
primero se cambia la tabla y se registra.

## Estados de una funcionalidad

1. **Reserva.** Una línea y el motivo. Sin versión, sin plan, sin compromiso.
2. **Planificada.** Tiene fila en la tabla con su versión objetivo. Todavía no tiene plan
   técnico ni tareas.
3. **En curso.** Tiene plan `vX.Y-implementacion.md`, cola en `TASKS.md` y su alcance está
   congelado (ver más abajo).
4. **Implementada.** Está en `dev` con su verificación escrita. Aún sin publicar.
5. **Publicada.** La fila dice `Publicada vX.Y.Z`; ocurre en el commit de release.

La columna «Estado» de la tabla solo usa **Planificada** y **Publicada vX.Y.Z**. Los
estados intermedios se leen en `TASKS.md`, que es la fuente de ejecución.

## Añadir una funcionalidad

1. **Entra a Reserva** con una línea. No se coloca en la tabla de inmediato.
2. **Para promoverla a una versión** se responde por escrito, en una entrada del registro:
   - **Pregunta:** qué se quiere resolver y para quién.
   - **Decisión:** en qué versión entra y qué queda fuera.
   - **Por qué ahora y por qué no antes o después:** dependencias y qué reutiliza.
   - **Riesgo:** superficie nueva (lectura de contenido ajeno, escrituras, red).
   - **Fuera de alcance:** lo que no se deduce de esta entrega.
   - **Renumeración:** qué números cambian, si alguno.
3. **Se toca la tabla** (fila nueva o ajustada) y la sección de dependencias de esa
   versión, en el mismo commit que el registro.
4. **Criterio de tamaño.** Una versión es una capacidad principal, útil y verificable por
   sí sola. Si necesita más de una, se divide en dos versiones.

## Cambiar el orden

- **Se puede reordenar** cualquier versión *Planificada*. Los números son objetivos de
  planificación y se confirman al preparar cada release; renumerar no toca manifiestos.
- **No se reordena ni se amplía** una versión *En curso*, *Implementada* ni *Publicada*. Si
  surge algo nuevo durante la implementación, es una funcionalidad aparte: va a Reserva o
  a la siguiente versión, con su entrada de registro.
- **Una escritura Git no se adelanta sin sus guardias.** Antes de exponer una operación que
  modifique el repositorio, su versión debe incluir o depender de la base de escrituras
  (exclusión por directorio Git común, recuperación, deshacer). Lectura antes que
  escritura, y menor riesgo antes que mayor.
- **Una dependencia manda sobre la preferencia.** Si A necesita B, B va antes de A. Se
  anota en la sección de dependencias de A.
- Cada reordenamiento se registra con la misma plantilla de entrada.

## Al publicar una versión

Forma parte del paso de README del flujo de release, antes del commit `chore: release`:

1. En la tabla, la fila pasa a `Publicada vX.Y.Z`.
2. La sección «Última entrega publicada» del roadmap se reemplaza por la de la versión nueva
   (un párrafo y enlaces a plan, ADR y verificación); la anterior pasa a referencia
   histórica o se elimina si no aporta.
3. Se actualiza la tabla de cabecera (última revisión y próxima entrega) y se revisan las dos entregas siguientes de la tabla: ¿siguen siendo las correctas y en
   ese orden? Si algo cambia, se registra. David confirma la próxima versión.
4. `TASKS.md` cierra la cola de la versión (archivada en `ARCHIVES.md`) y apunta a preparar
   el plan de la siguiente, según el [protocolo de trabajo](protocolo-trabajo.md).

## Comprobación automática

`src/docs/roadmap.test.ts` falla el build si la tabla repite o salta una versión, o si una
entrega *Publicada* aparece después de una *Planificada*.
