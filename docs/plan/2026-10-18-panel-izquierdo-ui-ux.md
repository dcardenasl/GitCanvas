# Panel izquierdo: especificación de UI/UX

Fecha: 2026-10-18. Estado: definición funcional consolidada, sin implementación. Acuerdos de David D01–D50, registrados en [la bitácora](../audits/2026-10-18-panel-izquierdo.md). Los criterios siguientes describen comportamiento futuro; no son pruebas aprobadas de capacidades aún inexistentes.

## Alcance

Panel de ramas locales, remotas, tags, releases GitHub y contribuyentes. Navegación, alcance del historial, énfasis por autor, colores persistentes y consulta de releases. Se conserva checkout existente. Crear, renombrar y eliminar ramas/tags son futuras mejoras (D34).

## Modelo de interacción

| Elemento | Clic en nombre | Casilla | Acciones |
|---|---|---|---|
| Rama local | Abrir/localizar commit | Incluir/excluir su historia alcanzable | Solo esta, color, checkout cuando corresponda |
| Rama remota | Abrir/localizar commit | Incluir/excluir su historia alcanzable | Solo esta, color compartido con upstream si aplica |
| Tag | Abrir/localizar commit resuelto | Incluir/excluir su historia alcanzable | Solo esta |
| Release | Abrir notas, fecha, tag y archivos en inspector | Misma visibilidad de su tag | Ver commit; Traer este tag si falta localmente |
| Contribuyente | Abrir/localizar su commit más reciente dentro del alcance | Destacar/atenuar sus commits | Acciones de énfasis del grupo |

Nombre, casilla y menú «⋯» son controles distintos. Un clic para inspeccionar o filtrar nunca ejecuta checkout (D10). Inspeccionar una referencia apagada no la enciende (D17). Consultar una release no descarga adjuntos (D31).

## Alcance y énfasis

- Historia visible = unión de commits alcanzables desde referencias encendidas (D01).
- Apagar una referencia quita solo commits que ninguna referencia encendida alcance. Una rama ya integrada puede no quitar commits.
- Autor apagado = commits atenuados, conexiones conservadas. No reduce ni amplía alcance (D02/D08).
- Autores por autor original, consolidando `.mailmap`; no fusionar por nombre. Catálogo completo y progresivo, independiente de páginas/filtros (D09/D30).
- HEAD puede apagarse; no cambia rama de trabajo ni destino pull/push (D26).
- `origin/HEAD` es distintivo de su destino, sin casilla ni raíz separada (D27).
- Local y upstream tienen casillas independientes. Release y tag tienen estado único compartido (D05/D12).
- Sin referencias encendidas: lista de commits vacía con explicación y «Mostrar todo». Cambios locales permanece accesible (D03/D28).
- Apagar todos los contribuyentes atenúa todos sus commits; no convierte esa selección en «todos destacados» (consecuencia de D08).

## Acciones de alcance y recuperación

| Acción | Referencias | Contribuyentes | Personalización |
|---|---|---|---|
| Solo esta | Solo referencia elegida, en todo el repositorio | Conservar | Conservar |
| Mostrar todo | Encender todas | Conservar | Conservar |
| Mostrar todo y localizar | Encender todas y localizar commit | Conservar | Conservar |
| Restablecer filtros | Encender todas | Destacar todos | Conservar colores, principal, orden y plegado |
| Acción masiva de sección | Toda la sección; con búsqueda, solo coincidencias | Destacar/atenuar si es sección de autores | Conservar |

Acciones masivas nombran alcance y número de resultados. Release/tag sincronizan aunque su contraparte no coincida con la búsqueda (D20). «Solo esta» es una acción sobre referencias existentes, no un modo que oculte futuras referencias (D07/D15).

Mantener detalle de commit excluido con aviso. «Mostrar todo y localizar» amplía alcance explícitamente (D16/D18). Diferenciar exclusión, paginación pendiente y commit no alcanzable. Deshacer visual recupera filtros/énfasis anteriores del repositorio, sin revertir operaciones Git y sin confirmaciones previas (D29).

Deshacer admite varios pasos por repositorio durante sesión, una acción masiva por paso. La pila se limpia al reiniciar y no restaura refs inexistentes ni apaga automáticamente referencias nuevas; la configuración final sí persiste (D48).

## Colores

- Automáticos, editables desde «⋯» y persistentes por repositorio (D11).
- Selector con paleta nombrada y tonos adaptados a tema claro/oscuro; mantener nombres y señales adicionales al color (D42). No prometer colores exclusivos para una cantidad ilimitada de ramas.
- Permitir reutilizar colores al agotar paleta; intentar distinguir recorridos vecinos al asignar nuevos sin recolorear preferencias existentes (D49).
- Misma identidad en panel e historial; independiente de posición del carril, filtros y reinicios.
- Local y upstream configurado comparten color; no inferir relación por nombres (D12).
- Si al vincularlos hay colores personalizados distintos, prevalece el personalizado más reciente. Si solo uno está personalizado, conservarlo; si ninguno, asignación automática estable. Editar desde cualquiera actualiza ambos (D50).
- Un nodo por commit. Recorridos con color propio hasta unión y un solo tramo compartido; prioridad principal visual cuando participa, en otro caso prioridad estable (D13).
- Principal visual detectada desde remoto, elegible por repositorio e independiente de HEAD (D14).
- Si desaparece, mantener gráfico usable y aviso «Rama principal no disponible · Elegir otra». No sustituir preferencia silenciosamente; recuperar rol si reaparece antes de nueva elección (D46).
- Apagar principal no recolorea historia compartida que sigue visible (D37).
- Colores no demuestran propiedad histórica exclusiva de commits. La asignación técnica debe conservar contexto de merges y el layout reanudable.

## Organización y espacio

- Búsqueda del panel por nombre; solo oculta filas, sin modificar casillas/historial. Separada de búsqueda de commits (D19).
- Conservar búsqueda por pestaña durante sesión; limpiar al reiniciar o cerrar/reabrir pestaña. Filtros persistentes no cambian (D47).
- Secciones plegables, con encendidas/total o destacados/total. Guardar plegado por repositorio (D21).
- Buscar revela temporalmente secciones con coincidencias; limpiar restaura plegado. Distinguir conteo de resultados y total.
- Orden inicial configurable: ramas activa primero y resto por nombre; remotas por remoto; tags/releases recientes primero; contribuyentes por nombre. No reordenar al marcar casillas (D32).
- Tags por fecha del commit de destino, rotulada «Fecha del commit»; releases por fecha de publicación. No atribuir fecha de creación a tags que no la registran (D41).
- Ramas con prefijos en carpetas virtuales plegables, conservando nombre completo para búsqueda y casillas individuales. En remotas, mantener nivel de remoto; no duplicar la rama activa (D39).
- Carpeta con casilla de tres estados para controlar descendientes; con búsqueda, solo coincidencias. Plegar no modifica visibilidad (D40).
- Conservar ocultamiento del panel al abrir archivo/diff para dar espacio; mantener opción de fijarlo (D24).
- Indicador compacto de filtros activos permite abrir panel sin cambiar filtros ni ocupar espacio permanente del diff (D25).
- Desde diff, el indicador abre panel temporalmente sin fijarlo ni cerrar diff/perder posición. Puede cerrarse y se oculta de nuevo al abrir otro archivo; «Fijar panel» sigue siendo acción explícita (D45).

## Persistencia y novedades

Primera apertura: todo encendido/destacado. Guardar por repositorio referencias, énfasis, colores, principal visual, orden, plegado y fuente de releases según acuerdos (D06/D11/D14/D21/D32/D36).

Elementos nuevos aparecen encendidos incluso con selección personalizada; conservar exclusiones conocidas. Release nueva sobre tag apagado respeta ese estado compartido. Todas apagadas no excluye automáticamente futuras referencias (D07).

Referencia desaparecida sale del listado; conservar sus preferencias para cuando reaparezca con el mismo nombre completo y repositorio. Otro nombre es elemento nuevo; no deducir renombres a partir de tips coincidentes (D38). Un error de lectura no es eliminación.

## Releases y red

Consultar GitHub al abrir Releases; actualización explícita, caché local y fecha. Sin red, últimos datos con aviso y reintento; sin caché, estado explicativo. No bloquear historia local (D22).

Fuente inicial `origin` si es GitHub; selector de remotos GitHub, persistente por repositorio. Identificar fuente y separar cachés por proyecto remoto. Cambiar fuente no cambia checkout ni principal visual (D36).

Tag ausente: notas disponibles y estado «Tag no disponible localmente», con «Traer este tag» explícito. No descargar historia por consultar releases. Visibilidad deseada encendida no implica que los datos estén disponibles (D23).

Adjuntos: «Descargar» por archivo, elección de destino, progreso y cancelar. No abrir/ejecutar automáticamente; cancelar mantiene contexto (D43).

Fallo de acceso: «Conectar GitHub» / «Revisar acceso» reutiliza conexión y retorna a Releases sin perder contexto; cancelar tampoco lo pierde. No confundir con «Sin releases». Conservar frontera de credenciales existente (D44).

## Matriz de aceptación futura

| Caso | Resultado esperado |
|---|---|
| Apagar rama divergente | Desaparece solo historia exclusiva; commits compartidos permanecen |
| Apagar todo | Historial vacío explícito; Cambios locales accesible |
| Atenuar autor | Commits/conexiones permanecen; señal de énfasis y estado accesibles |
| Marcar release/tag | Ambos controles reflejan un estado único |
| Inspeccionar ref apagada | Detalle abierto sin cambiar casillas; aviso si queda fuera del alcance |
| Mostrar todo y localizar | Referencias encendidas, commit localizado, énfasis conservado |
| Restablecer filtros | Todas referencias/autores activos; colores/orden/plegado conservados |
| Buscar y apagar resultados | Solo coincidencias de esa sección; contador explícito |
| Limpiar búsqueda | Casillas intactas; plegado previo restaurado |
| Solo esta y nueva rama | Solo la elegida tras acción; nueva rama posterior entra encendida |
| Reiniciar/cambiar pestaña | Restauración aislada por repositorio sin lecturas periódicas inactivas |
| Referencia desaparece/reaparece | Fila retirada mientras falta; preferencias recuperadas al volver |
| Filtrar/reordenar carriles | Colores por rama/tramo estables y nodos sin duplicar |
| Abrir archivo | Panel oculto salvo fijado; indicador de filtros accesible |
| Release sin red | Caché identificada o estado sin datos; historial local usable |
| Release sin tag local | Notas disponibles; descarga solo por acción explícita |
| Más de 500 commits | Alcance, autores y navegación no limitados a primera página |
| Carga/error de refs | No presentar error como vacío ni borrar preferencias |
| Teclado y lector | Controles separados, estado anunciado, foco conservado y menú accesible |
| Carpeta parcialmente encendida | Estado intermedio accesible; acción afecta solo descendientes/coincidencias |
| Tags recientes | Fecha del commit identificada como tal; releases por publicación |
| Vincular local/upstream con colores distintos | Prevalece último personalizado; ambos reflejan mismo color |
| Principal visual desaparecida | Gráfico usable, aviso y elección explícita; sin cambio de rama de trabajo |
| Error de acceso GitHub | Recuperación de conexión y retorno sin perder contexto |
| Descargar/cancelar adjunto | Destino explícito, progreso, cancelación, sin abrir/ejecutar automáticamente |
| Deshacer varios cambios | Un paso por acción; aislado por repo; no revierte Git ni oculta novedades |
| Cambiar pestaña/reiniciar con búsqueda | Conservar durante sesión, limpiar al reiniciar; filtros intactos |

## Criterios técnicos para la implementación

Los siguientes son criterios derivados del contexto y propuestas técnicas, no respuestas adicionales de David. Resolverlos al preparar la implementación y contrastarlos con la matriz anterior:

- Conservar límites de ancho y tamaño mínimo existentes. Nombres largos deben ofrecer nombre completo por ayuda accesible/tooltip sin forzar ensanchar el diff. No crear versión móvil de una app de escritorio.
- Carga, actualización, vacío real, búsqueda sin coincidencias, fallo y datos guardados desactualizados son estados distintos. Error con caché conserva datos/preferencias; error sin caché no equivale a cero refs. Reintento acotado por sección.
- Botones nativos y controles accesibles independientes: Enter inspecciona, Espacio marca casilla, Escape cierra menú; conservar menú de teclado existente. Anunciar estados mixtos y acciones masivas sin mover foco ni depender solo de color.
- Autores sin mailmap requieren clave estable basada en datos de autor; no fusionar por nombre. Bots son autores sin exclusión automática. Coautores de trailers no se incorporan como autores principales por inferencia de D09.
- Definir prioridad cromática secundaria determinista independiente de casillas y páginas; no alterar layout previo al cargar otra página. Grupos con varias ramas locales siguiendo el mismo upstream requieren una única identidad de color y resolución determinista conforme D50.
- Pin del panel mantiene comportamiento existente: no introducir persistencia al reiniciar sin necesidad de producto. La apertura temporal D45 no cambia ese pin.
- Pilas de deshacer, cachés e índices deben tener límites; elegir tamaño concreto en diseño técnico. Deshacer se aplica a preferencias de entidades conocidas y no revierte cambios del repositorio.
- Credenciales existentes en Rust/keychain; consultas/descargas privadas deben respetar esa frontera. Cancelación y resultados de operaciones nombran su repositorio/fuente aunque se cambie de pestaña.
- Extender contrato persistente con migración/versionado y recuperación de errores, sin habilitar repositorios por el solo hecho de leer preferencias guardadas. Preservar ausencia de lecturas periódicas de proyectos inactivos.
- Añadir backend e IPC tipados para alcance, autores, mailmap, remotos/releases, tags y adjuntos según se necesite; `bindings.ts` se regenera, no se edita manualmente.

No se incorpora «Invertir selección», gestión de ramas/tags, filtros por committer/coautor ni otras funciones no acordadas. Si un detalle técnico exige cambiar un comportamiento aprobado, volver a preguntarlo antes de implementarlo.

## Evidencia actual

Prueba nativa de navegación rama/tag y abrir/cancelar menú de checkout; captura en bitácora. Cuatro archivos de pruebas existentes, 49 casos aprobados con Node 22. Las capacidades nuevas de esta especificación todavía no están implementadas ni verificadas. No se ejecutaron checkout, pull, push o descargas para la auditoría.
