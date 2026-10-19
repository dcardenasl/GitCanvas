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
| v0.7 | Contribuyentes y releases | Identidades con .mailmap, énfasis y navegación por autor; releases GitHub, notas, tag, adjuntos, caché sin conexión, recuperación de acceso y descargas explícitas. |
| v0.8 | Múltiples proveedores | Separar Git local de capacidades del proveedor; GitLab como primera ampliación; cuentas/servidores y credenciales aisladas. Bitbucket, Azure DevOps y servidores propios quedan para ampliaciones según necesidad. |
| v0.9 | Crear y conectar repositorios | Inicializar repositorios locales; crear remotos en proveedores compatibles; elegir cuenta/organización, nombre y visibilidad; conectar proyectos existentes y ofrecer primer push explícito. |
| v0.10 | Gestión cotidiana de ramas | Crear, renombrar y eliminar ramas con protecciones; crear tags y gestionar remotos; fetch explícito y diferencias local/upstream. |
| v0.11 | Preparar archivos y crear commits | Preparar/retirar archivos completos, título/descripción, borradores por proyecto, hooks y firma, recuperación de errores y actualización del gráfico. |

## Próxima entrega: v0.4

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
  modificar silenciosamente filtros. Concretar semántica de renombrados y merges
  al preparar su plan técnico, sin prometer seguimiento infalible.
- **v0.7:** catálogo completo/progresivo de autores independiente de páginas y
  filtros, sin fusionar personas por nombre. Atenuar conserva nodos/conexiones.
  Releases y tags comparten visibilidad; fuente GitHub identificada y caché separada.
  Consulta de notas no trae tags ni adjuntos. Traer tag y descargar archivo son
  acciones explícitas; destinos, progreso, cancelación y retorno tras autenticación
  conservan contexto. Aplicar las protecciones de escritura necesarias antes de
  incorporar fetch de tags, sin esperar a la entrega de commits.
- **v0.8:** interfaz por capacidades, sin exigir que todos los proveedores permitan
  lo mismo. Mantener Git local independiente de REST del proveedor. Reutilizar la
  frontera Rust/keychain; no mezclar cuentas, servidores o cachés. El diseño debe
  permitir extensiones, sin implementar todos los proveedores en esta versión.
- **v0.9:** creación remota depende de capacidades y permisos del proveedor. Definir
  recuperación ante creación remota exitosa y fallo local posterior, sin reintentos
  que dupliquen repositorios. No ejecutar primer push automáticamente.
- **v0.10:** definir guardias y recuperación de cada operación antes de exponerla.
  Respetar worktrees y operaciones concurrentes; borrar ramas o alterar remotos no
  se deduce de un clic de navegación. No incluir merge/rebase por inferencia.
- **v0.11:** aplicar el contrato de commits del plan de 2026-10-08: Git del sistema,
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
- Stash.
- Gestión de worktrees: creación y retirada; reconocimiento/navegación ya planificados para v0.5.
- Acceso a pull requests/merge requests según proveedor.
- Proveedores adicionales: Bitbucket, Azure DevOps y servidores propios.
- Merge, rebase, cherry-pick y resolución de conflictos: requieren planificación
  específica de seguridad y recuperación.
- Preparación por líneas y amend: posteriores al flujo de commits por archivos.

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
