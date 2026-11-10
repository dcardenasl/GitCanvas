# GitCanvas — roadmap de versiones

Fecha: 2026-10-19. Estrategia aprobada por David en conversación.
Estado: planificación; las funcionalidades futuras no están implementadas por este documento.

## Prioridad y precedencia

Mejorar primero la lectura del gráfico y el panel izquierdo. Separar su evolución en
entregas funcionales, empezando por las líneas y colores de las ramas. La preparación
de archivos y creación de commits queda al final de la secuencia acordada.

Este roadmap sustituye la asignación anterior de commits a v0.4 y el orden de entrega
del plan de tres funcionalidades de 2026-10-08. Sus contratos de preparación/commit
siguen siendo referencia para esa futura entrega; no se descartan.
La especificación del panel de 2026-10-18 y sus acuerdos D01–D50 siguen vigentes:
se distribuyen entre versiones, sin cambiar su comportamiento por inferencia.

Las versiones son objetivos de planificación, sin fechas ni incrementos aplicados a
los manifiestos. Confirmar el número al preparar cada release. Registrar cambios de
alcance aquí y mantener TASKS.md como fuente de ejecución. Cada entrega debe quedar
útil y verificable por sí sola; no esperar al panel completo para publicar mejoras.

## Secuencia acordada

| Objetivo | Entrega | Alcance |
|---|---|---|
| v0.4 | Ramas visualmente claras | Continuidad, curvas, separación y cruces de líneas; colores estables por rama, coherentes entre panel y gráfico; paleta accesible en claro/oscuro; selección de color y principal visual. |
| v0.5 | Panel izquierdo, filtros y worktrees | Reconocimiento y navegación de worktrees del mismo repositorio; búsqueda, secciones plegables, carpetas por prefijos, contadores, menús; activar/desactivar ramas y tags; Solo esta, restablecer y deshacer; persistencia por repositorio e indicador de filtros durante el diff. |
| v0.6 | Historial por archivo | Entrada desde inspector/lista de archivos; commits que modificaron el archivo, diff y contenido histórico; seguimiento de renombrados cuando sea determinable, con límites explícitos. |
| v0.7 | Stash de solo lectura | Listar los stashes en una sección plegable del panel izquierdo (mensaje, rama base, fecha) y ver su diff y contenido sin aplicar, descartar ni crear. Sin escrituras Git. El nodo de stash en el gráfico queda reservado. |
| v0.8 | Vista de imágenes | Mostrar como imagen los archivos binarios de imagen en todos los visores de archivos (commit, historial por archivo, stash y cambios locales): formatos comunes, SVG sin ejecutar scripts, comparación anterior/guardada, dimensiones y tamaño. Solo lectura, con los presupuestos existentes. Los demás binarios siguen reportándose sin renderizar. |
| v0.9 | Contribuyentes y releases | Identidades con .mailmap, énfasis y navegación por autor; releases GitHub, notas, tag, adjuntos, caché sin conexión, recuperación de acceso y descargas explícitas. |
| v0.10 | Múltiples proveedores | Separar Git local de capacidades del proveedor; GitLab como primera ampliación; cuentas/servidores y credenciales aisladas. Bitbucket, Azure DevOps y servidores propios quedan para ampliaciones según necesidad. |
| v0.11 | Crear y conectar repositorios | Inicializar repositorios locales; crear remotos en proveedores compatibles; elegir cuenta/organización, nombre y visibilidad; conectar proyectos existentes y ofrecer primer push explícito. |
| v0.12 | Escrituras locales seguras: stash y ramas | Primero la base común de escrituras (exclusión por directorio Git común, recuperación, deshacer). Después, stash: guardar todos los cambios, aplicar, aplicar y quitar, descartar con deshacer. Luego crear, renombrar y eliminar ramas con protecciones; crear tags y gestionar remotos; fetch explícito y diferencias local/upstream. Ver [registro de alcance](#registro-de-cambios-de-alcance). |
| v0.13 | Preparar archivos y crear commits | Preparar/retirar archivos completos, título/descripción, borradores por proyecto, hooks y firma, recuperación de errores y actualización del gráfico. |

## Próxima entrega: v0.7 — stash de solo lectura

Actualización de planificación: 2026-11-08. v0.6 está implementada; la próxima
funcionalidad acordada es inspección de stash. Decisiones de la entrevista, contrato,
límites, matriz y tareas ST-0–ST-8 en el
[plan v0.7](2026-11-08-v0.7-implementacion.md), con
[ADR 0009](../adr/0009-read-only-stash.md) como diseño técnico propuesto.
ST-1 (motor de listado) implementada y verificada el 2026-11-08; comparaciones,
IPC e interfaz pendientes en ST-2–ST-8. No implica bump ni publicación.
Los gates históricos sin evidencia continúan abiertos en `TASKS.md`.

## Entrega de referencia: v0.4 (plan histórico)

### Resultado esperado

Poder seguir una rama hasta sus bifurcaciones y uniones, reconocer su color en el
panel y en el gráfico, y conservar esa identidad entre páginas y reinicios. La
principal visual organiza la lectura; elegirla nunca ejecuta checkout.

### Orden de implementación

1. **GRF-1 — Contrato y casos de referencia.** Documentar la separación entre
   geometría, identidad de referencia y color; revisar fixtures y definir evidencia
   visual con ramas divergentes, merges cercanos, referencias compartiendo tip,
   octopus, HEAD detached y muchas ramas. Elegir el diseño técnico antes de cambiar
   la representación; conservar los acuerdos del panel.
2. **GRF-2 — Identidad cromática y persistencia.** Paleta nombrada adaptable a temas,
   preferencias por repositorio y principal visual. Local/upstream comparten color
   por relación configurada; al vincular colores personalizados prevalece el último
   elegido. Migrar/versionar preferencias sin perder workspace ni autorizar rutas.
3. **GRF-3 — Líneas del gráfico.** Mejorar trazado, continuidad, curvas, separación
   y cruces, manteniendo topología, un nodo por commit y layout reanudable. Cargar
   otra página no mueve ni recolorea lo ya mostrado.
4. **GRF-4 — Colores y controles integrados.** Aplicar identidad cromática a panel
   y gráfico; menú para elegir color/principal visual, teclado y señales adicionales
   al color. Historia compartida usa un solo tramo y prioridad determinista; la
   principal desaparecida tiene recuperación explícita. No presentar colores como
   propiedad histórica exclusiva de una rama.
5. **GRF-5 — Verificación de la entrega.** Casos Git anteriores, paginación de más
   de 500 commits, reinicio y cambio de pestaña, preferencias y upstream, ambos temas,
   inglés/español y ventana mínima 940×600. Pruebas adecuadas y recorridos nativos en
   macOS/Linux/Windows; registrar lo que siga sin verificarse.
6. **GRF-6 — Documentación y preparación de release.** Actualizar evidencia,
   documentación y CHANGELOG según comportamiento entregado. Aplicar el flujo de
   release del proyecto cuando corresponda y con las autorizaciones de ese flujo.

### Límites de v0.4

No incorpora filtros de alcance, contribuyentes, releases, historial por archivo ni
nuevas escrituras Git. La búsqueda, carpetas y organización completa del panel se
entregan en v0.5. Se permite añadir el control necesario para colores y principal
visual, sin adelantar el resto de funcionalidades por inferencia.

Los acuerdos cromáticos D11–D14, D37, D42, D46 y D49–D50 guían esta entrega. D37
se verifica con filtros reales cuando llegue v0.5; desde v0.4 la asignación debe ser
independiente del futuro alcance y de la posición del carril.

## Dependencias y criterios de versiones posteriores

- **v0.5:** filtrar el recorrido completo en Rust, con cursor/caché ligados al
  alcance. No filtrar solo filas cargadas. Distinguir inspección, visibilidad,
  checkout y énfasis. Mantener cambios locales accesibles con todo apagado; conservar
  detalle fuera del alcance con aviso. Referencias nuevas/reaparecidas y deshacer
  siguen los acuerdos de la especificación. Comprobar que filtrar no recolorea
  historia compartida. Migrar preferencias y mantener proyectos inactivos sin sondeo.
- **v0.6:** consulta explícita por archivo, con paginación y trabajo acotado. Puede
  encontrar commits fuera del alcance actual del gráfico; indicar contexto sin
  modificar silenciosamente filtros. Semántica de renombrados y merges concretada en
  [ADR 0008](../adr/0008-per-file-history.md) y el
  [plan técnico](2026-11-01-v0.6-implementacion.md), sin prometer seguimiento infalible.
- **v0.7 (stash de solo lectura):** consulta explícita de stashes en Rust, con
  límites y paginación, y sin tocar el gráfico. Los stashes se listan con su rama
  base y se abren en el visor de diff existente. Aplicar, descartar y crear quedan
  fuera: son escrituras que requieren guardias y recuperación antes de exponerse. El
  nodo de stash en el gráfico se reserva: el commit WIP tiene como padres la base y
  el índice guardado, con un tercero opcional para archivos no rastreados. Su futura
  representación debe respetar "un nodo por commit" y la reanudabilidad; v0.7 no
  incorpora estos objetos como raíces del gráfico. Las comparaciones acordadas y la
  lectura del reflog se concretan en el [plan v0.7](2026-11-08-v0.7-implementacion.md).
- **v0.8:** consulta explícita de los bytes de un archivo de imagen, por comando Rust
  con `runtime::read` y `with_repo`, acotada por los presupuestos del
  [ADR 0002](../adr/0002-local-file-safety-and-resource-budgets.md): el contenido
  grande se rechaza con metadatos, sin leerlo entero. El formato se decide por los bytes
  iniciales, nunca por la extensión. Formatos iniciales: PNG, JPEG, GIF, WebP, BMP e
  ICO; el SVG se muestra como imagen aislada (sin scripts ni recursos externos) y también
  como texto. Respeta orientación y fotogramas de GIF animado de forma acotada. La vista
  se integra en los cuatro lectores existentes sin duplicarlos: un archivo nuevo o
  borrado muestra una sola imagen, y uno modificado ofrece anterior y guardada, lado a
  lado y con deslizador. Los binarios que no son imagen siguen mostrando su estado actual.
  Accesible (texto alternativo con ruta, dimensiones y tamaño) y verificada en ambos temas
  e idiomas. Sin edición ni conversión de formatos.
- **v0.9:** catálogo completo/progresivo de autores independiente de páginas y
  filtros, sin fusionar personas por nombre. Atenuar conserva nodos/conexiones.
  Releases y tags comparten visibilidad; fuente GitHub identificada y caché separada.
  Consulta de notas no trae tags ni adjuntos. Traer tag y descargar archivo son
  acciones explícitas; destinos, progreso, cancelación y retorno tras autenticación
  conservan contexto. Aplicar las protecciones de escritura necesarias antes de
  incorporar fetch de tags, sin esperar a la entrega de commits.
- **v0.10:** interfaz por capacidades, sin exigir que todos los proveedores permitan
  lo mismo. Mantener Git local independiente de REST del proveedor. Reutilizar la
  frontera Rust/keychain; no mezclar cuentas, servidores o cachés. El diseño debe
  permitir extensiones, sin implementar todos los proveedores en esta versión.
- **v0.11:** creación remota depende de capacidades y permisos del proveedor. Definir
  recuperación ante creación remota exitosa y fallo local posterior, sin reintentos
  que dupliquen repositorios. No ejecutar primer push automáticamente.
- **v0.12:** definir guardias y recuperación de cada operación antes de exponerla.
  Respetar worktrees y operaciones concurrentes; borrar ramas o alterar remotos no
  se deduce de un clic de navegación. No incluir merge/rebase por inferencia.
  Orden interno: (1) base de escrituras, (2) stash, (3) ramas, tags y remotos. El
  stash va primero porque es el consumidor de menor riesgo: no toca historia, remotos
  ni ramas, y cada operación es reversible. Contrato de stash:
  - **Vista previa:** el inspector de v0.7 es el paso previo a aplicar; la acción se
    ofrece desde él y desde la fila del panel.
  - **Aplicar:** simulación previa de la mezcla en memoria. Si hay conflictos, cambios
    locales que se pisarían o archivos no rastreados que colisionan, se rechaza sin
    tocar el disco. Nunca deja un árbol en conflicto: la app no resuelve conflictos
    hasta que exista su planificación específica. Aplica al worktree activo.
  - **Aplicar y quitar (pop):** quita el stash solo después de verificar que la
    aplicación terminó bien.
  - **Descartar:** confirmación que muestra el mensaje y el SHA; conserva el SHA para
    deshacer (reinsertarlo en el reflog) mientras la sesión o el objeto existan. Como
    el stash es compartido, avisa cuando otros worktrees lo ven.
  - **Guardar:** todos los cambios, con mensaje y opción de incluir no rastreados. Es
    el complemento de aplicar y permite "guardar y cambiar de rama" cuando el checkout
    rechaza por cambios locales. Guardar parcial (rutas, mantener índice) se agrupa con
    la preparación de v0.13.
  - Reutiliza la observación del reflog y el fingerprint de v0.7: tras cada escritura
    el listado se actualiza sin invalidar el gráfico.
- **v0.13:** aplicar el contrato de commits del plan de 2026-10-08: Git del sistema,
  hooks/firma, índice completo, validación HEAD/índice, borradores y conciliación de
  resultados indeterminados. Exclusión de escrituras por directorio Git común antes
  de habilitar operaciones; adelantarla cuando una entrega anterior la requiera.
  Probar primer commit, renombrados, fallos de hooks/firma, cambios externos y pérdida
  de respuesta. Sin reintentos automáticos de escrituras.

## Worktrees — ampliación aprobada el 2026-10-19

Estado: decisión de producto aprobada; implementación pendiente. v0.4 sigue guardando
colores y principal visual por raíz canónica de worktree. La siguiente entrega cambiará
ese alcance de preferencias; no se presenta como comportamiento ya disponible.

### v0.5 — Reconocimiento y navegación

- Presentar los worktrees como espacios de trabajo de un mismo repositorio. Añadir
  sección **Worktrees** al panel con nombre, rama activa y ubicación. HEAD detached y
  ubicaciones ausentes tendrán estados explícitos.
- Marcar en las ramas **Abierta en…** cuando estén ocupadas por otro worktree.
  En ese caso, ofrecer **Abrir ese worktree** en lugar de intentar cambiar a la rama.
- Abrir cada worktree en su propia pestaña o activar la existente; mantener una
  agrupación visual por repositorio y distinguir el nombre del worktree. Cerrar una
  pestaña no cierra las demás ni elimina un worktree.
- Conservar un único nodo por commit en el gráfico y señalar las ramas abiertas en
  cada worktree. La relación entre worktrees no crea commits ni trayectorias nuevas.
- Compartir colores y principal visual entre los worktrees del mismo repositorio.
  Conservar selección, búsqueda, filtros, desplazamiento, HEAD, índice y cambios
  locales independientes; el contexto activo siempre identifica el worktree.
- Identificar la relación desde los metadatos Git y el directorio Git común canónico,
  nunca por nombre de carpeta o URL de remoto. Dos clones independientes del mismo
  remoto no comparten automáticamente identidad ni preferencias.
- El descubrimiento no autoriza rutas ni operaciones: abrir un worktree pasa por la
  validación y autorización existentes. No añadir sondeo periódico de worktrees
  inactivos ni recorrer carpetas arbitrarias para encontrarlos.

Antes de implementar, concretar la migración de las preferencias v0.4: conciliar
colores y principales distintos entre worktrees, preservar los datos anteriores y
hacer explícita cualquier elección necesaria. Las secuencias de edición actuales son
por raíz y no establecen un orden global entre worktrees. El cambio de alcance no
permite perder personalizaciones silenciosamente. Documentar la nueva decisión de
arquitectura y sus pruebas junto con la migración.

Aceptación: repositorio principal y varios worktrees vinculados; misma rama marcada
con su ubicación; HEAD detached; raíz ausente, bloqueada o eliminada externamente;
pestaña existente sin duplicación; clones independientes; reinicio y migración con
preferencias en conflicto; cambio de worktree sin mezclar archivos, HEAD ni navegación.
Las pruebas deben conservar los límites de caché y la observación del proyecto activo.

### Entrega posterior — Gestión

Sin versión asignada: crear worktrees desde ramas nuevas o existentes, detectar los
bloqueados o ausentes y permitir retirarlos con protección de cambios locales.
Planificar guardias, concurrencia por directorio Git común y recuperación antes de
exponer escrituras. Esta ampliación no adelanta creación ni eliminación a v0.5.

## Reserva de futuras funcionalidades

Sin versión ni implementación comprometida:

- Comparar dos commits o ramas.
- Blame por línea.
- Stash: aplicar, descartar y guardar todo están asignados a v0.12 (ver registro de
  alcance). Sin versión: guardar parcial (rutas, mantener índice), que se agrupa con la
  preparación de v0.13, y el nodo de stash en el gráfico (tras decidir su tratamiento
  en el layout; hoy solo existe el marcador sobre el commit base).
- Gestión de worktrees: creación y retirada; reconocimiento/navegación ya planificados para v0.5.
- Acceso a pull requests/merge requests según proveedor.
- Proveedores adicionales: Bitbucket, Azure DevOps y servidores propios.
- Merge, rebase, cherry-pick y resolución de conflictos: requieren planificación
  específica de seguridad y recuperación.
- Preparación por líneas y amend: posteriores al flujo de commits por archivos.

## Registro de cambios de alcance

### 2026-11-09 — Stash: dónde van las escrituras

Pregunta: tras v0.7 (solo lectura), ¿aplicar y descartar se quitan, se adelantan o se
dejan para cuando haya commits?

Decisión: **se conservan, antes de commits y sin renumerar en ese momento** (hoy v0.12, antes de los commits de v0.13, tras la renumeración del registro siguiente).

- **No se eliminan.** Inspeccionar sin poder actuar deja el flujo a medias, y el
  inspector de v0.7 es justo la vista previa que aplicar necesita.
- **No esperan a los commits.** Aplicar no depende de crearlos: checkout, pull y push
  ya escriben sin que existan. Lo que el usuario hace con los cambios aplicados puede
  seguir siendo externo hasta v0.13, igual que hoy.
- **No se adelantan a v0.9–v0.11.** Aplicar y descartar son las primeras escrituras
  que cambian el árbol de trabajo y el reflog. Necesitan antes la base de escrituras
  (exclusión por directorio Git común, recuperación, deshacer) y esa base es la misma
  de ramas y commits; construirla una vez y usar el stash como primer cliente reduce
  el riesgo de v0.13. Aplicar con conflictos requeriría además una interfaz de
  conflictos que sigue sin planificar, por eso se rechaza en vez de resolverse.
- **Regla de adelanto:** si v0.9 construye la base de escrituras (lo exige para traer
  tags), el stash se publica en la primera versión posterior a ella, sin esperar a
  v0.12. Se registra aquí al decidirlo.
- **Agrupación:** la secuencia queda como lectura (v0.4–v0.9), conexión y proveedores
  (v0.10–v0.11) y escrituras locales (v0.12–v0.13), con las de menor riesgo primero.

### 2026-11-09 — Imágenes: se añade como v0.8 y se renumera lo posterior

Pregunta: el roadmap no contemplaba mostrar los binarios de imagen; hoy el lector los
marca como `Binary` y no muestra nada. ¿Se incluye y dónde?

Decisión: **se incluye como v0.8, justo después del stash de solo lectura. Las entregas
posteriores pasan a v0.9–v0.13** (contribuyentes/releases v0.9, proveedores v0.10,
crear/conectar v0.11, escrituras locales seguras v0.12, commits v0.13).

- **Sí corresponde.** Es lectura de historia, el centro del producto, y para diseño web,
  móvil o de juegos buena parte de lo que cambia en un commit son imágenes. Sin esto,
  esos cambios parecen vacíos.
- **Por qué ahora y no después.** Los cuatro lectores de archivos quedan unificados en
  v0.7 (commit, índice, disco y stash comparten la misma política de binarios). Añadir la
  vista mientras ese lector compartido está fresco cuesta una vez; hacerlo tras proveedores
  o escrituras obligaría a reabrirlo con más superficie.
- **Por qué antes de v0.9.** Contribuyentes y releases, proveedores y creación de
  repositorios no dependen de ella ni la necesitan; la línea de lectura local queda
  continua (v0.4–v0.8) antes de abrir la red y los proveedores. Es una entrega pequeña,
  de bajo riesgo y útil por sí sola.
- **Por qué antes de comparar y de commits.** "Comparar dos commits o ramas" (reserva) y la
  revisión de cambios previa a un commit (v0.13) reutilizarán el visor; ya deben heredar
  las imágenes.
- **Riesgo que fija el alcance.** Decodificar contenido de repositorios es una superficie
  de ataque: por eso solo formatos comunes decodificados por el WebView, SVG aislado,
  límites de bytes y dimensiones, y ningún archivo se ejecuta ni se abre fuera de la app.
- **Fuera de alcance.** PDF, audio, vídeo, formatos de diseño (PSD, Figma) y modelos 3D.
  Se evalúan por separado si hay demanda; no se deducen de esta entrega.
- **Renumeración.** Es solo de planificación: no hay versiones aplicadas a manifiestos.
  El contrato del stash escrito (v0.12) y la regla de adelanto no cambian, solo su número.

## Seguimiento y evidencia

Antes de empezar: reconciliar el cierre histórico WS-17 con CI y releases existentes,
conservando las comprobaciones manuales que no tengan evidencia. v0.3.1 es la última
release confirmada en GitHub al registrar este plan; quality de `21ab4ff` y el workflow
de publicación de v0.3.1 finalizaron correctamente. Esto no acredita por sí solo cada
comprobación manual de WS-17.

Las PR de dependencias son mantenimiento separado del alcance funcional. La PR #11
(WebdriverIO) tenía fallo de tipos E2E en los tres sistemas durante la revisión;
revisar su estado antes de actuar, sin atribuir ese fallo a la release publicada.

Este registro autoriza la estrategia de planificación. No inicia implementación,
no cambia versiones de la aplicación ni ejecuta commits, push, PR o publicación.

## Referencias

- [Tareas de ejecución](../../TASKS.md)
- [Panel izquierdo: acuerdos D01–D50](2026-10-18-panel-izquierdo-ui-ux.md)
- [Plan de tres funcionalidades y contratos de commits](2026-10-08-plan-tres-funcionalidades.md)
- [Release v0.3.1](https://github.com/dcardenasl/GitCanvas/releases/tag/v0.3.1)
- [Quality v0.3.1](https://github.com/dcardenasl/GitCanvas/actions/runs/38659431936)
- [Publicación v0.3.1](https://github.com/dcardenasl/GitCanvas/actions/runs/38664028286)
