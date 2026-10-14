# ADR 0006: Workspace, pestañas y persistencia

## Estado

Aceptado — 2026-10-14

## Decisión

**Identidad y estado.** La raíz canónica del worktree (`RepositoryInfo.path`) identifica
una pestaña. Alias de la misma raíz activan la pestaña existente; worktrees vinculados
son proyectos distintos. `state/workspace.ts` compone el almacén con porciones de
`state/workspaceStore/` (pestañas, biblioteca, vista, almacenamiento, límites y cerradas);
cada porción actualiza el estado con un único `set` atómico y las reglas entre porciones
son funciones puras. Coordina el orden, la activa y las sesiones;
`navigation.ts` contiene transiciones puras. Cada sesión conserva selección, búsqueda,
carpetas, ancla, expansión y estado de acciones. Los callbacks se atan a la raíz que
los inició. Cambiar de pestaña no redirige respuestas ni avisos a otro proyecto. Una
pestaña con una escritura en curso no se puede cerrar.

**Apertura y autorización.** Carpeta local, clon, recientes y favoritos pasan por
`openProjectAt` y el comando de apertura; el argumento de arranque devuelve el mismo
contrato validado. Lo leído del almacén solo restaura presentación: no autoriza Git.
La activación bloquea escrituras de forma síncrona, antes de los efectos de React; el
propio ejecutor rechaza callbacks sin verificación. Se reabre la raíz, se exige identidad
estable y se leen referencias y la huella local antes de habilitar acciones.
Si no cambiaron se conserva la paginación; si cambiaron se invalida. La vista espera
antes de consultar un proyecto restaurado. Un fallo conserva una pestaña recuperable:
Reintentar, Localizar o Cerrar. Localizar a otra pestaña abierta la reutiliza y elimina
solo la inaccesible; al cambiar de raíz comienza navegación nueva para no atribuirle
selecciones del proyecto anterior.

**Observación y recursos.** Solo la activa tiene watcher, poller y consultas observadas.
Las inactivas muestran estado operativo, sin presentar ramas o cambios locales como
actuales. `ProjectCache` conserva datos pesados de la activa y de las cinco inactivas
usadas más recientemente, además del `gcTime` de consultas. Referencias y huella son
ligeras; el cierre elimina todas las consultas de esa raíz. No cambia el presupuesto
global de `HistoryReader`: ocho instantáneas y dos millones de ids.

**Almacén.** `gitcanvas-core/workspace` define esquema, validación y escritor exclusivo;
Tauri solo autoriza y planifica IPC. `workspace.json`, versionado, reside en el directorio
de datos. Se reemplaza atómicamente después de escribir y vaciar un temporal vecino.
La revisión monotónica impide aplicar un guardado tardío sobre uno nuevo. Los límites
los publica el backend: treinta pestañas, doscientos favoritos, veinte recientes;
también valida rutas, ids, carpetas y cuatro MiB por archivo. Datos corruptos o de versión
futura se apartan, conservando tres originales recientes, y se informa de su ubicación.
Un fallo de lectura o guardado permite continuar en memoria y queda visible.

**Qué se recuerda.** Orden de pestañas, activa, selección de commit/archivo o lado local,
ancla de historial, carpetas colapsadas, favoritos y recientes. No se guardan objetos Git,
diffs, cachés, operaciones pendientes ni expansión de archivos. Búsqueda y controles de
vista duran la sesión en memoria. Tema, idioma, tamaños de panel y modo de listado siguen
en `localStorage`: el idioma se debe resolver síncronamente antes del primer render.
La navegación se guarda con debounce de 300 ms; los cambios estructurales se encolan de
inmediato. Un único escritor drena también cambios recibidos durante un guardado.
El cierre y la salida normal del sistema pasan por el vaciado; si falla, la ventana
permanece abierta para recuperar el guardado. La salida tiene plazo: el frontend confirma
la solicitud de cierre (`acknowledge_shutdown`) antes de vaciar y, si no responde en tres
segundos, un vigilante destruye la ventana para que un renderizador bloqueado no retenga
la app. Una terminación forzada del proceso no puede ejecutar ese vaciado y conserva el
último archivo completo.

**Restauración y navegación.** Se carga el almacén antes de montar la interfaz y solo
se valida inicialmente la pestaña activa. Las demás quedan «sin verificar» hasta usarse,
pero todas sus rutas entran en el registro de protección de clones. El argumento de
arranque se añade sin descartar la restauración; cede si la persona abrió otro proyecto
mientras se resolvía. Un ancla no cargada no provoca lecturas ocultas de páginas. El detalle de un commit
seleccionado fuera del walk se pide por id con el mismo flujo autorizado. Ante un fallo
de render, el botón de recuperación reinicia el proceso nativo desde el último estado
durable; recargar solo la página desalinearía las secuencias de solicitudes con Rust.

**Favoritos y recientes.** Favoritos independientes de pestañas, ordenados por nombre,
con carpeta o ruta para desambiguar. Recientes por último uso, sin repetir favoritos en
la presentación y sin reordenamiento manual. Intentar abrir una ruta inaccesible muestra
el error y permite quitar la entrada. Solo las pestañas abiertas protegen clones de la
retención; un favorito expulsado conserva su ruta recuperable. Se protege también la
entrada cuyo Git común usa un worktree externo y el contenedor de proyectos anidados.
Mientras se sincroniza la protección o no puede resolverse una dependencia, no se hace
limpieza. Una reparación tampoco reemplaza una entrada usada por un proyecto abierto.
La retención y el reemplazo entregan el borrado al registro mediante `RemoveGuard`: la
decisión «nadie la usa» y la eliminación son un solo paso, sin ventana para que una
pestaña la abra entre ambos.

**Interfaz y menú.** Barra compacta sobre la toolbar; cada pestaña es un proyecto y el
«+» abre carpeta, GitHub, favoritos o recientes. Arrastre por puntero, teclado con foco
itinerante, Alt+flechas para reordenar y Supr para cerrar. Ctrl+Tab y ⌘/Ctrl+1–9 recorren
pestañas; Ctrl+O/W en Windows y Linux respetan los campos de texto. En macOS un menú
propio recibe ⌘O y ⌘W, con etiquetas del catálogo activo; la salida del sistema se dirige
al cierre con guardado. Todo usa las mismas acciones del workspace.

**Casos de uso de pestañas.** Un menú contextual (clic derecho o tecla de menú) cierra la
pestaña, las demás o las de la derecha, y copia la ruta. Ctrl+Mayús+T (⇧⌘T en macOS)
reabre la última cerrada con su selección y búsqueda; el historial de cerradas es de
sesión y está acotado. Soltar una carpeta en la ventana usa el evento de arrastre del
webview y pasa por `openProjectAt`: la ruta soltada no concede acceso por sí misma.
«Mostrar en el explorador» queda fuera a propósito: exigiría lanzar procesos o ampliar
los permisos del webview.

**Verificación aislada.** Los E2E usan repositorios con marcador de propiedad y un
directorio de datos temporal. Las ventanas compiladas con `e2e` usan WebView privado:
el directorio Rust por sí solo no aísla `localStorage`. No se reutilizan ni modifican
sesiones o preferencias reales. Los instaladores de producción no incluyen el servidor
WebDriver ni el modo privado de pruebas.

## Consecuencias

Treinta pestañas pueden conservar sesiones ligeras, mientras la caché pesada tiene un
límite explícito. El almacén no supone permisos ni disponibilidad futura; recuperar
una ruta sigue siendo una apertura autorizada. La escritura serializada mantiene un
estado final predecible, pero un fallo del sistema o disco puede impedir guardar y se
reporta. El esquema permite una evolución futura validada, sin adaptar silenciosamente
versiones desconocidas. Preparación y creación de commits, borradores y exclusión mutua
entre worktrees pertenecen a v0.4; esta entrega no los introduce.
