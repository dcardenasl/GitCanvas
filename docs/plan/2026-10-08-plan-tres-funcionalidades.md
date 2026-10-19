# GitCanvas: commits, idiomas y múltiples proyectos

> Actualización 2026-10-19: el [roadmap vigente](2026-10-19-roadmap-de-versiones.md)
> sustituye el orden de entrega: gráfico/panel primero y commits al final (objetivo
> v0.11). Los contratos funcionales de este documento siguen como referencia.

## 1. Objetivo y arquitectura

Incorporar las tres funcionalidades manteniendo las responsabilidades actuales: operaciones Git en `gitcanvas-core`, autorización y ejecución en Tauri, estado y presentación en React. Los contratos IPC seguirán definidos en Rust y generados mediante Specta.

Decisiones confirmadas:

- Preparar y retirar **archivos completos** del índice; confirmar lo preparado con título y descripción.
- Utilizar **Git del sistema**, respetando hooks, identidad, filtros y firma.
- Incorporar **pestañas, favoritos y restauración de sesión**.
- Iniciar en español cuando el sistema use español; inglés en los demás casos. Permitir una elección persistente.

La robustez se verificará mediante invariantes, pruebas de concurrencia y recuperación de fallos. No se prometerá infalibilidad frente a procesos externos, hooks arbitrarios o fallos del sistema operativo.

## 2. Selección de archivos y commits

### Interfaz y comportamiento

- Ampliar el inspector de cambios locales existente con selección múltiple y acciones **Preparar seleccionados** y **Retirar seleccionados**. Abrir el diff será una acción independiente de seleccionar para preparar.
- Mantener las secciones preparados y sin preparar, sus totales y paginación. La selección se identificará por ruta y lado; un archivo puede aparecer en ambos con contenidos distintos.
- “Seleccionar todos” afectará únicamente a los archivos cargados y lo indicará expresamente. No habrá acciones globales ambiguas sobre archivos ocultos por paginación.
- Añadir título obligatorio, descripción opcional y botón de commit. Mostrar el total completo de archivos preparados, incluidos los preparados desde otra herramienta.
- El commit incluirá **todo el índice**, sin preparar automáticamente modificaciones posteriores en disco. Esta corresponde a la semántica documentada de [Git commit](https://git-scm.com/docs/git-commit).
- El título será de una sola línea; el mensaje se compondrá como título, línea vacía y descripción cuando exista. El contador de 72 caracteres será orientativo.
- Conservar el borrador ante errores y cambios de pestaña. Limpiarlo únicamente después de confirmar el éxito.
- Al terminar, actualizar cambios locales, historial y referencias del proyecto de origen; mostrar y revelar el commit creado.

### Motor y contratos

- Incorporar comandos tipados `get_git_capabilities`, `stage_files`, `unstage_files` y `create_commit`. Todos exigirán repositorio autorizado y pasarán por el planificador de escrituras.
- Las solicitudes transportarán rutas explícitas y el estado esperado de HEAD e índice. El backend volverá a validar estos datos antes de operar; una vista obsoleta obligará a actualizar y revisar.
- Mantener el fingerprint actual para observación. Para validar escrituras, utilizar identidad de HEAD y una huella verificable del índice; el fingerprint de sondeo no será una garantía de integridad.
- Crear un adaptador de procesos Git dentro del motor Rust: ejecutable validado, argumentos separados, sin shell, entrada por stdin o archivo temporal privado, y salida acotada. Eliminar variables heredadas que puedan redirigir repositorio o índice.
- Preparar y retirar mediante rutas literales delimitadas por NUL. Resolver correctamente altas, modificaciones, eliminaciones y ambos extremos de renombrados. Retirar del índice nunca modificará el archivo en disco; también funcionará antes del primer commit.
- Ejecutar el commit sin rutas adicionales, sin `-a`, sin `--no-verify` y sin desactivar la firma. Git ejecutará los [hooks configurados](https://git-scm.com/docs/githooks).
- Detectar ausencia o incompatibilidad de Git y ofrecer seleccionar su ejecutable en preferencias. La inspección existente continuará disponible.
- Bloquear commits vacíos, conflictos sin resolver y operaciones de merge, rebase, cherry-pick o revert pendientes. Permitir el primer commit; advertir claramente cuando HEAD esté separado de una rama.
- Mantener los límites de confinamiento de rutas existentes. Submódulos y rutas no representables por el contrato actual producirán un resultado explícito, sin omisiones silenciosas.

### Concurrencia y recuperación

- Añadir exclusión mutua de escrituras por directorio Git común, compartida por preparación, commit, checkout, pull y push. Los worktrees vinculados compartirán esa exclusión; repositorios independientes podrán utilizar los dos permisos globales actuales.
- Respetar los bloqueos nativos de Git. Un bloqueo externo producirá un error recuperable; nunca se eliminará automáticamente.
- Las escrituras no tendrán reintentos automáticos. Los resultados distinguirán éxito, rechazo y resultado indeterminado.
- Un hook puede modificar archivos, índice o mensaje. Releer siempre el estado final y mostrar cualquier diferencia respecto de lo solicitado; no ejecutar una reversión automática.
- Ante cancelación, interrupción o pérdida de respuesta, reconciliar HEAD e índice antes de permitir otro intento. Si no puede atribuirse inequívocamente un commit a la operación, mostrar el resultado como indeterminado.
- El backend conservará la operación aunque cambie la pestaña. Se podrá cambiar de proyecto, pero no cerrar su pestaña mientras siga escribiendo.

## 3. Internacionalización completa

- Integrar `i18next` y `react-i18next`, con claves tipadas, namespaces por funcionalidad, interpolación y plurales. Sus capacidades de [tipado](https://www.i18next.com/overview/typescript) y [fallback](https://www.i18next.com/principles/fallback) evitan desarrollar un motor propio.
- Crear un registro único de idiomas con código BCP 47, nombre nativo, dirección del texto y catálogos locales. Inglés será el catálogo base y fallback.
- Ofrecer **Sistema / English / Español**. Resolver la preferencia antes de renderizar la aplicación para evitar mostrar primero otro idioma.
- Cambiar el idioma inmediatamente, sin reiniciar ni perder selección, borradores o proyectos abiertos. Actualizar `lang` y `dir` del documento.
- Migrar todos los textos visibles: botones, menús, estados, errores, confirmaciones, tooltips, accesibilidad y diálogos controlados por la aplicación. Los diálogos del sistema conservarán el idioma del sistema.
- Formatear fechas, cantidades y plurales con el locale activo. No traducir rutas, referencias Git, nombres, mensajes de commits ni contenido de archivos.
- Mantener errores estructurados en Rust. React traducirá su categoría y contexto; los diagnósticos originales quedarán en un detalle expandible y copiable. Los avisos persistidos almacenarán códigos y parámetros, no frases ya traducidas.
- CI comprobará claves, interpolaciones y formas plurales requeridas por cada idioma. Incorporar un idioma exigirá añadir sus catálogos y una entrada del registro, sin modificar componentes.
- Preparar los componentes nuevos con propiedades CSS lógicas y verificar expansión del texto y dirección RTL mediante pruebas de presentación.

## 4. Pestañas, favoritos y persistencia

### Estado independiente

- Sustituir la sesión global de un único repositorio por un workspace con pestañas ordenadas, pestaña activa y sesiones identificadas por la raíz canónica del worktree.
- Cada sesión conservará selección de commit y archivo, posición del historial, búsqueda, expansión de carpetas, selección para preparar, borrador y estado de operaciones.
- Tema, idioma, tamaños de paneles y modo de listado seguirán siendo preferencias generales.
- Separar el coordinador del workspace de la vista de repositorio. Solo se montará la vista activa; sus estados relevantes vivirán en la sesión, no en componentes que desaparecen al cambiar.
- Mantener las claves de consultas por repositorio. Toda respuesta y notificación se aplicará al proyecto que inició la operación, aunque haya cambiado la pestaña.
- Corregir el uso de datos anteriores como placeholder para impedir que archivos del proyecto anterior aparezcan o habiliten acciones en el nuevo.

### Navegación y observación

- Incorporar una barra compacta sobre la toolbar, con pestañas reordenables, cierre, botón de apertura y menú de desbordamiento.
- Abrir de nuevo un worktree ya abierto activará su pestaña. Worktrees distintos del mismo repositorio tendrán pestañas independientes.
- Distinguir nombres repetidos con información de carpeta y mostrar la ruta completa en el tooltip.
- Incluir navegación accesible por teclado, foco visible y atajos habituales para abrir, cerrar y recorrer pestañas; no interceptarlos al editar textos cuando corresponda.
- Conservar **un único watcher y poller para el proyecto activo**, reutilizando el control de generaciones existente.
- Al activar una pestaña, verificar identidad, HEAD y estado local antes de habilitar escrituras. Reutilizar las páginas del historial si las referencias no cambiaron.
- Los proyectos inactivos conservarán su sesión, sin consultas periódicas. Sus indicadores reflejarán el último estado conocido hasta verificarlos.
- Retener caché pesada del proyecto activo y, como máximo, cinco proyectos inactivos mediante LRU. Mantener el presupuesto global existente del motor; cerrar una pestaña liberará sus recursos de observación y presentación.

### Favoritos y recuperación

- Añadir favoritos persistentes y una lista de veinte proyectos recientes. Favoritos y pestañas serán independientes: cerrar una pestaña no eliminará el favorito.
- Centralizar workspace, favoritos, idioma y borradores en almacenamiento de aplicación gestionado por Rust: esquema versionado, validación, escritor único y reemplazo atómico.
- Persistir rutas, orden, pestaña activa, navegación y borradores. No persistir diffs, historiales, selecciones pendientes de preparación ni operaciones como si siguieran ejecutándose.
- Reabrir la sesión progresivamente, priorizando el proyecto activo. Un repositorio explícito recibido al iniciar se abrirá y activará sin descartar la sesión restaurada.
- Revalidar cada ruta mediante el flujo autorizado de apertura. Los datos guardados no autorizarán directamente operaciones Git.
- Ante rutas desaparecidas o repositorios inaccesibles, mantener una pestaña recuperable con opciones para reintentar, localizar o cerrar.
- Conservar borradores al cerrar una pestaña; permitir descartarlos explícitamente. Los fallos de persistencia serán visibles, sin impedir seguir trabajando en memoria.
- Sustituir la protección de una sola ruta activa en la caché de clones por un registro backend de repositorios abiertos y operaciones en curso. La limpieza o reparación nunca eliminará un clon usado por una pestaña inactiva.

## 5. Implementación y criterios de aceptación

**Orden de entrega:** fundamentos de workspace, persistencia y exclusión de escrituras; internacionalización completa; pestañas y favoritos; preparación y commits. Cada entrega deberá ser funcional y verificable, sin adaptadores temporales ni duplicación del estado anterior.

Pruebas obligatorias:

- **Git:** primer commit, contenido preparado distinto del disco, índice preparado externamente, renombrados, eliminaciones, binarios, permisos, rutas con espacios y caracteres especiales, retirada sin alterar archivos y rechazo de rutas inseguras.
- **Fallos:** identidad ausente, Git ausente, firma fallida, hooks rechazados o modificadores, índice bloqueado, cambios externos, cancelación y éxito seguido de pérdida de respuesta. Ningún reintento duplicará un commit.
- **Concurrencia:** doble clic, cambio rápido de pestaña, respuestas tardías, escrituras simultáneas y worktrees con directorio común.
- **Idiomas:** detección regional, preferencia persistente, traducción completa, plurales, formatos, fallback, textos largos y cambio de idioma durante una operación.
- **Workspace:** duplicados y alias, nombres repetidos, restauración, favoritos, rutas desaparecidas, almacenamiento corrupto, conservación de borradores, paginación aislada y protección de clones abiertos.
- **Interfaz:** recorrido completo por teclado, temas claro y oscuro y ventana mínima de 940 × 600. El graph conservará su layout reanudable.

Ejecutar los controles actuales de tipos, formato, lint, pruebas, cobertura, Clippy y deriva de bindings; validar los flujos nativos en macOS, Windows y Linux.

Actualizar las decisiones de arquitectura y la documentación de producto para reflejar idiomas, workspace y nuevas escrituras. La regla de mensajes de una línea seguirá aplicándose a los commits del propio proyecto GitCanvas; la aplicación respetará las reglas de cada repositorio gestionado.

Quedan fuera de esta entrega: preparación por líneas, amend, resolución de conflictos, push automático y varias ventanas. La actualización de Impeccable a v4.5.1 se planificará como tarea independiente.
