# Auditoría y definición del panel izquierdo

## 1. Objetivo

Probar los flujos existentes del panel izquierdo y definir con David sus comportamientos coherentes de navegación, visibilidad y filtrado. La entrevista usa una pregunta a la vez; las recomendaciones no son decisiones aprobadas.

## 2. Entorno

- Fecha: 2026-10-18, America/Santiago.
- Proyecto: GitCanvas, React + Tauri 2, versión declarada 0.3.1.
- Superficie: `src/components/Sidebar/Sidebar.tsx`.
- Estado previo: `docs/media/` sin seguimiento; se preserva.
- Browser plugin no disponible en esta sesión. Se prueba el binario Tauri nativo mediante accesibilidad y captura; no se abre servidor web ni se necesita fallback Playwright para esta superficie.

## 3. Registro del proceso

### Paso 1: inspección inicial

- Intento: contrastar la hipótesis de controles de encendido/apagado con la implementación.
- Esperado: determinar si existen controles de visibilidad distintos de navegación y checkout.
- Observado: tres grupos, ramas locales, remotas y tags. Cada fila navega al commit; las ramas locales no actuales ofrecen checkout por menú contextual. No hay checkbox, switch ni estado de visibilidad en el componente.
- Resultado: ausencia de controles confirmada por código; falta verificación interactiva.
- Evidencia: `Sidebar.tsx`, `RefGroup`, `onClick`, `onContextMenu`.
- Siguiente: probar la superficie renderizada y revisar contratos de filtros y persistencia.

### Paso 2: prueba en la aplicación nativa

- Entorno real: ventana GitCanvas en macOS, contenido `tauri://localhost`, español, tema oscuro. Captura de 3024×1898 píxeles; no equivale a tamaño CSS. La versión del binario instalado no se comprobó; 0.3.1 corresponde al checkout.
- Flujo probado: pestaña GitCanvas → rama main → detalle del commit `4de8d69` → clic derecho → menú «Cambiar a main» → Escape → tag v0.3.1 → tag v0.3.0 → detalle `cff99c4`.
- Resultado: navegación de rama y tag anterior funciona; el tag v0.3.1 conserva el mismo commit que main, como corresponde. Menú abierto y cancelado; no se ejecuta checkout.
- Evidencia: árbol de accesibilidad muestra los commits esperados y el menú; captura nativa muestra las referencias y el gráfico sin overlay de error.
- Observación visual: main, origin/HEAD, origin/main y v0.3.1 comparten resaltado al inspeccionar `4de8d69`; HEAD permanece en dev. Los nombres remotos largos se truncan.
- No hay controles de visibilidad, búsqueda local de refs, contadores, colapso de secciones ni acciones masivas en el panel observado.
- Siguiente: contrastar los casos no reproducidos con pruebas automatizadas y formular la primera decisión semántica.

### Paso 3: automatización y límite de entorno

- Primer intento: pruebas Sidebar, history y navigation con Node 20.20.0 del shell. Resultado: 31 pruebas pasan pero Sidebar no arranca; error `webidl.util.markAsUncloneable is not a function` de jsdom/undici. No es evidencia de fallo de la UI. El proyecto declara Node >=22.
- Corrección local del entorno: usar Node 22.22.3 ya instalado, sin cambiar dependencias ni archivos de configuración.
- Reejecución: `npm run test -- src/components/Sidebar/Sidebar.test.tsx src/state/history.test.ts src/state/navigation.test.ts src/components/AppShell/HistoryView.test.tsx` con Node 22: **4 archivos, 49 pruebas aprobadas**.
- Cobertura relevante: navegación, HEAD, selección, tags anotados, grupo vacío y menú de checkout, incluido teclado. Son pruebas de componentes/estado con IPC simulado, no checkout Git real.
- Detector Impeccable sobre Sidebar.tsx: salida `[]`, exit 0, cero hallazgos. No comprueba que existan las capacidades solicitadas.

### Paso 4: entrevista iniciada

- Pregunta 1 enviada: al apagar una rama/tag, excluir su historial exclusivo, ocultar solo su etiqueta o atenuarla.
- Recomendación provisional: mostrar la unión de commits alcanzables desde referencias encendidas. Un commit compartido sigue visible mientras una referencia encendida lo alcance.
- Estado: **aprobado por David**: excluir historial exclusivo, conservando commits compartidos. Apagar una rama ya integrada puede no quitar commits si otra referencia encendida alcanza todo su historial.
- Pregunta 2 respondida: al seleccionar contribuyentes, **destacar sus commits y atenuar el resto**, conservando conexiones del gráfico dentro de las referencias encendidas. No añade commits externos a ese alcance.

### Decisiones aprobadas

- **D01 — Alcance por referencias:** unión de commits alcanzables desde ramas/tags encendidos. Apagar una referencia elimina solo lo que deja de ser alcanzable desde las restantes.
- **D02 — Contribuyentes como énfasis:** dentro de D01, destacar commits de contribuyentes seleccionados y atenuar los demás. Conservar conexiones y contexto de merges; no ampliar el alcance de referencias.
- **D03 — Estado inicial y vacío:** todas las referencias encendidas al iniciar. Se permite apagar todas: historial vacío explícito con acción «Mostrar todo». No reinterpretar ninguna como todas. La restauración de una selección previa y el comportamiento de cambios locales quedan por definir.
- Pregunta 3 respondida y aprobada por David. Identidad del contribuyente y persistencia siguen pendientes.
- **D04 — Tags y releases:** David solicita ambos: tags del repositorio y releases de GitHub, incluyendo la capacidad de consultar notas y archivos asociados. La relación de visibilidad entre release y tag, el acceso remoto y los estados sin conexión quedan por definir; no se asume autorización para descargar archivos ni operar sobre releases.
- Pregunta 4 respondida: «ambos». No se adopta la recomendación de limitar versiones a tags.
- **D05 — Estado compartido release/tag:** aprobado por David. Una release y su tag comparten un único estado de visibilidad por referencia Git. Cambiarlo en Releases actualiza Etiquetas y viceversa; la release añade metadatos, no una segunda raíz independiente del historial. Identificar por repositorio y referencia, no solo por título de release.
- Pregunta 5 respondida: «ok, de acuerdo». Releases sin tag disponible localmente y estados remotos siguen pendientes.
- **D06 — Persistencia por repositorio:** aprobado por David. Recordar referencias encendidas/apagadas y contribuyentes destacados al cambiar de pestaña y al reiniciar la app. D03 se aplica en primera apertura y al restablecer. Releases/tags mantienen el estado único de D05. No implica persistir búsquedas, scroll o plegado; esos detalles siguen pendientes.
- Pregunta 6 respondida: «si, deberia recordarlo».
- **D07 — Lo nuevo se muestra por defecto:** David establece este criterio para toda la app: los elementos nuevos aparecen automáticamente y luego el usuario puede apagar los que no quiere ver. En referencias, ramas/tags nuevos se incorporan encendidos incluso con una selección personalizada guardada; se conservan las exclusiones explícitas de elementos ya conocidos. Las releases respetan el estado compartido de su tag (D05): una release nueva sobre un tag ya apagado no debe reactivarlo.
- Pregunta 7 respondida: «creo que deberian aparecer automaticamente por defecto, y luego apagar las que no quiero ver. Eso sería la logica siemre en toda la app». Se descarta la recomendación anterior de dejar referencias nuevas apagadas en selecciones personalizadas.
- Consecuencia de D03 + D07: si todas las referencias conocidas están apagadas, el historial permanece vacío hasta que se encienda alguna o aparezca una referencia nueva; esa referencia nueva entra encendida. El estado vacío no equivale a una exclusión permanente de elementos futuros.
- **D08 — Apagado de contribuyentes conserva contexto:** David confirma «atenuación como habíamos acordado». D02 se mantiene: apagar un contribuyente atenúa sus commits, sin ocultarlos ni romper conexiones. Con D07, los contribuyentes nuevos aparecen encendidos y se conservan las exclusiones previas. Ramas/tags controlan alcance; contribuyentes controlan énfasis dentro de ese alcance. Las etiquetas y ayudas deberán explicar esta diferencia.
- Pregunta 8 respondida; no se modifica D02.
- **D09 — Identidad por autor y mailmap:** aprobado por David. Usar al autor original del commit para contribuyentes; consolidar alias explícitos de `.mailmap`. No fusionar personas solo por nombre visible. El committer no define esta atribución. Identidad sin mailmap, coautores y bots siguen pendientes.
- Pregunta 9 respondida: «si, de acuerdo».
- **D10 — Acciones de fila separadas:** aprobado por David. Clic en nombre de rama/tag navega al commit; casilla independiente enciende/apaga; botón visible «⋯» abre operaciones disponibles, como checkout. El nombre y la casilla nunca ejecutan checkout. Mantener accesibilidad de teclado y menú contextual existente. La fila de release necesita además acceso a notas/archivos; recorrido específico pendiente.
- Pregunta 10 respondida: «si, de acuerdo».
- **R11 — Color identificable por rama:** David propone agregar un color por rama que permita reconocerla en el historial. Se incorpora como requisito de diseño; asignación automática/manual, persistencia, correspondencia con carriles, commits compartidos, merges y accesibilidad siguen por definir. No se asume que un commit pertenezca exclusivamente a una rama.
- **D11 — Color estable y editable por rama:** aprobado por David. Asignar automáticamente y permitir editar desde «⋯». Conservar por repositorio y mostrar junto al nombre de rama y en el historial. La identidad cromática no cambia al filtrar, reordenar carriles o reiniciar. No depender de la posición del carril. Regla exacta de líneas, historia compartida y merges pendiente.
- Pregunta 11 respondida: «si, de acuerdo».
- **D12 — Color compartido local/upstream:** aprobado por David. La rama local y la remota configurada como su upstream comparten color, con visibilidad independiente y distinción local/remota explícita. Usar la relación Git configurada, no semejanza del nombre. Ramas sin seguimiento mantienen identidad propia. Pendiente resolver conflictos al vincular colores personalizados y relaciones con múltiples ramas locales.
- Pregunta 12 respondida: «si, de acuerdo».
- **D13 — Colores en historia compartida:** aprobado por David. Mantener un solo nodo por commit; recorridos con color propio hasta la unión y un solo tramo común desde allí. El tramo común usa el color de la rama principal cuando participa; en los demás casos, prioridad estable entre ramas. Las etiquetas conservan el color de cada rama. Git no registra una rama propietaria histórica: el color es una convención visual, no prueba de pertenencia exclusiva. Prioridad exacta, elección de principal y efecto de ocultarla pendientes.
- Pregunta 13 respondida: «si, de acuerdo».
- **D14 — Principal visual configurable:** aprobado por David. Detectar la rama predeterminada del remoto cuando Git aporta el dato y permitir cambiarla por repositorio. Si falta información fiable, permitir elegirla. La preferencia organiza gráfico y colores; es independiente de HEAD y nunca ejecuta checkout. Resolver remoto preferido y respaldo si la referencia desaparece más adelante.
- Pregunta 14 respondida: «si, de acuerdo».
- **D15 — Aislar una referencia:** aprobado por David. «Solo esta» en el menú de una rama/tag enciende la referencia elegida y apaga las demás referencias de todas las secciones, respetando el estado compartido release/tag (D05). No modifica énfasis de contribuyentes ni ejecuta checkout. Permite volver al alcance completo mediante «Mostrar todo». D07 sigue vigente: referencias nuevas aparecen encendidas incluso después de aislar una referencia; «Solo esta» no es un modo que excluya automáticamente futuras referencias.
- Pregunta 15 respondida: «si, de acuerdo». Acciones masivas por sección e invertir siguen pendientes.
- **D16 — Conservar detalle fuera del alcance:** aprobado por David. Al excluir el commit inspeccionado del historial visible, mantener abierto su detalle y mostrar «Este commit está fuera del historial visible», con una acción explícita para volver a mostrarlo. No cerrar detalle ni reactivar referencias automáticamente. No confundir fuera del alcance con aún no cargado por paginación. El efecto exacto de la acción de recuperación sigue pendiente.
- Pregunta 16 respondida: «si, de acuerdo».
- **D17 — Inspeccionar referencias apagadas sin reactivarlas:** aprobado por David. El clic en el nombre abre el detalle del commit sin modificar filtros ni encender la referencia. Si el commit ya está visible por otra referencia, localizarlo normalmente; si está excluido, mantener el detalle con el aviso D16. La casilla o una acción explícita modifica el alcance.
- Pregunta 17 respondida: «si, de acuerdo».
- **D18 — Mostrar todo y localizar:** aprobado por David. Desde el aviso de commit excluido, la acción «Mostrar todo y localizar» enciende todas las referencias, conserva énfasis de contribuyentes y localiza el commit, sin ejecutar checkout. Si el commit ya no es alcanzable desde ninguna referencia, mostrar diagnóstico recuperable en vez de prometer que aparecerá. El mecanismo para deshacer el cambio de alcance queda pendiente.
- Pregunta 18 respondida: «si, de acuerdo».
- **D19 — Búsqueda propia del panel:** aprobado por David. Buscar por nombre entre ramas, tags, releases y contribuyentes reduce solo las filas mostradas en el panel; no modifica casillas ni alcance del historial. Es independiente de la búsqueda de commits. Alcance de acciones masivas durante búsqueda, persistencia de la consulta y tratamiento de grupos plegados pendientes.
- Pregunta 19 respondida: «si, de acuerdo».
- **D20 — Acciones masivas con alcance explícito:** aprobado por David. Sin búsqueda, encender/apagar en bloque afecta a toda la sección; con búsqueda, solo a sus resultados coincidentes, con etiquetas «Encender resultados (N)» / «Apagar resultados (N)». Contribuyentes expresa el efecto como destacar/atenuar. «Mostrar todo» conserva alcance global y «Solo esta» D15. Tags/releases sincronizan D05 aunque su contraparte no coincida con la búsqueda; no cuentan dos veces como raíces del historial.
- Pregunta 20 respondida: «si, de acuerdo».
- **D21 — Secciones plegables con resumen persistente:** aprobado por David. Permitir plegar cada sección y mostrar encendidas/total en su encabezado, por ejemplo «Ramas locales · 3/8 encendidas»; contribuyentes muestra destacados/total. Conservar plegado por repositorio al cambiar de pestaña y reiniciar. Durante búsqueda, revelar temporalmente secciones con coincidencias sin sobrescribir el plegado guardado; al limpiar, restaurarlo. Distinguir conteo de resultados de búsqueda del total del grupo.
- Pregunta 21 respondida: «si, de acuerdo».
- **D22 — Releases remotas con caché local:** aprobado por David. Consultar metadatos de GitHub al abrir la sección Releases y ofrecer «Actualizar». Guardar resultados por repositorio con fecha de actualización; sin red, mostrar últimos datos con aviso y reintento. Sin caché, explicar indisponibilidad. El historial Git local sigue funcionando. El acceso privado, adjuntos y tags ausentes localmente requieren decisiones específicas; esta consulta no implica descargar adjuntos ni ejecutar fetch Git.
- Pregunta 22 respondida: «si, de acuerdo».
- **D23 — Traer tag de release explícitamente:** aprobado por David. Si falta localmente, mostrar notas de la release y estado «Tag no disponible localmente», con acción «Traer este tag» para habilitar su historia. No traer tags/commits solo por abrir Releases o consultar notas. D07 implica intención de visibilidad encendida para elementos nuevos, no disponibilidad ficticia: mientras falta el tag, explicitar que su historia aún no está disponible. No sobrescribir refs existentes al resolver conflictos; diseñar errores y autenticación.
- Pregunta 23 respondida: «si, de acuerdo».
- **D24 — Priorizar espacio del diff:** David rechaza mantener el panel visible por defecto: «no, me gusta que el espacio para el diff sea grande». Conservar ocultamiento automático al abrir archivo/diff y la opción existente de fijar el panel. No adoptar persistencia del pin por inferencia; pendiente si se desea. Ocultar panel no modifica alcance ni énfasis. H06 queda resuelto como comportamiento deseado, no defecto por corregir.
- Pregunta 24 respondida con rechazo de la recomendación; se preserva el comportamiento actual.
- **D25 — Indicador de filtros activos:** aprobado por David. Mostrar indicador compacto en barra superior cuando haya referencias apagadas o contribuyentes atenuados, también con panel oculto. Pulsarlo permite abrir el panel para revisar filtros sin modificarlos. No ocupar espacio permanente del diff; distinguir alcance reducido y énfasis cuando corresponda. Definir si la apertura es temporal o equivale a fijar el panel sin inferir persistencia del pin.
- Pregunta 25 respondida: «si, de acuerdo».
- **D26 — HEAD apagable sin cambiar rama de trabajo:** aprobado por David. Permitir apagar la rama marcada HEAD como las demás; conservar su distintivo de activa. El control de visibilidad no ejecuta checkout ni cambia el destino de pull/push. La barra de operaciones debe identificar la rama de trabajo real, distinta de la referencia inspeccionada y de la principal visual. No incluir HEAD silenciosamente como raíz adicional si está apagada.
- Pregunta 26 respondida: «si, de acuerdo».
- **D27 — Alias simbólico como distintivo:** aprobado por David. Mostrar `origin/HEAD` como «Predeterminada del remoto» sobre su rama destino; sin fila ni casilla independiente y sin raíz adicional de historia. Aplicar el mismo criterio a alias equivalentes de otros remotos. Si está roto o no se puede resolver, informar estado sin inventar destino. Distinguir predeterminada del remoto de principal visual configurable (D14).
- Pregunta 27 respondida: «si, de acuerdo».
- **D28 — Cambios locales independientes del alcance histórico:** aprobado por David. Mantener «Cambios locales» accesible aunque todas las referencias estén apagadas; D03 vacía solo la lista de commits. Los filtros de referencias y el énfasis de contribuyentes no ocultan ni atenúan cambios sin commit. El vacío indica «No hay referencias encendidas» con «Mostrar todo», distinto de un repositorio sin historial.
- Pregunta 28 respondida: «si, de acuerdo».
- **D29 — Deshacer configuración visual:** aprobado por David. Ofrecer «Deshacer» tras cambios de filtros/énfasis, especialmente «Solo esta» y acciones masivas, restaurando la configuración visual anterior del mismo repositorio. No pedir confirmación previa para estas acciones reversibles. No revierte checkout, descarga de tags ni otras operaciones Git; explicitar ese alcance. Duración/pila y referencias nuevas pendientes.
- Pregunta 29 respondida: «si, de acuerdo».
- **D30 — Catálogo completo y progresivo de contribuyentes:** aprobado por David. Obtener autores de toda la historia alcanzable del repositorio, independientemente de páginas cargadas o filtros visibles. Calcular progresivamente sin bloquear el gráfico e indicar lista/conteo incompletos mientras corresponda. Mantener contribuyentes atenuados listados para reactivarlos. Actualizar con nueva historia/mailmap conservando preferencias; no presentar conteos parciales como definitivos.
- Pregunta 30 respondida: «si, de acuerdo».
- **D31 — Detalle de release dentro de la app:** aprobado por David. Clic en nombre de release abre notas, tag, fecha y archivos en el panel de detalle, con acción separada «Ver commit» que respeta D17/D23. La casilla controla visibilidad sincronizada con el tag. Consultar no descarga archivos ni abre navegador automáticamente. La navegación al detalle de release es específica de esa entidad; D10 se conserva para ramas/tags.
- Pregunta 31 respondida: «si, de acuerdo».
- **D32 — Orden y agrupación inicial configurables:** aprobado por David. Ramas: activa primero y demás por nombre. Remotas: agrupar por remoto. Tags/releases: más recientes primero. Contribuyentes: por nombre. Permitir modificar orden por sección y guardarlo por repositorio. Encender/apagar no reordena filas, conservando posición y foco. Para tags, concretar criterio de recencia: un tag ligero no registra fecha propia; no presentar fecha del commit como fecha de creación del tag.
- Pregunta 32 respondida: «si, de acuerdo».
- **D33 — Navegación desde contribuyente:** aprobado por David. Clic en nombre localiza y abre su commit más reciente dentro del alcance de referencias encendidas, sin cambiar filtros ni énfasis. La casilla conserva D08. Si no tiene commits en el alcance, indicarlo sin ampliarlo automáticamente. Consultar la historia completa del alcance, no solo páginas cargadas; feedback y cancelación deben respetar trabajo acotado.
- Pregunta 33 respondida: «si, de acuerdo».
- **D34 — Gestión de ramas/tags fuera de esta entrega:** David acuerda reservar crear, renombrar y eliminar ramas/tags para futuras mejoras. Primera implementación prevista: navegación, filtros, colores, contribuyentes, releases y checkout existente. «⋯» no incorpora nuevas operaciones de gestión Git por inferencia. Esta entrevista define diseño; no autoriza por sí misma su implementación.
- Pregunta 34 respondida: «si, de acuerdo. para futuras mejoras».
- **D35 — Restablecer filtros preserva personalización:** aprobado por David. «Restablecer filtros» enciende todas las referencias y destaca todos los contribuyentes, conservando colores, principal visual, orden y plegado. «Mostrar todo» y «Mostrar todo y localizar» solo amplían referencias y mantienen énfasis (D18). Restablecer filtros no restablece preferencias generales.
- Pregunta 35 respondida: «si, de acuerdo».
- **D36 — Fuente de releases elegible y persistente:** aprobado por David. Usar `origin` inicialmente cuando apunte a GitHub; permitir elegir entre remotos GitHub y guardar la elección por repositorio. Mostrar claramente el proyecto fuente de Releases. Cambiar fuente no cambia rama de trabajo ni principal visual. Sin fuente válida, explicar indisponibilidad sin bloquear historia local; autenticación privada pendiente. Mantener cachés separadas por identidad del proyecto remoto y no mezclar releases de proyectos distintos.
- Pregunta 36 respondida: «si, de acuerdo».
- **D37 — Filtrar no recolorea historia compartida:** aprobado por David. Conservar color del tramo común cuando se apaga la principal si esos commits siguen visibles desde otras referencias. Apagar no añade la principal al alcance ni conserva commits exclusivos. Para D13, determinar participación cromática de la principal sobre historia del repositorio, no únicamente referencias encendidas; separar asignación cromática de alcance del recorrido.
- Pregunta 37 respondida: «si, de acuerdo».
- **D38 — Recuperar preferencias de referencias reaparecidas:** aprobado por David. Retirar del listado una referencia que deja de existir y conservar sus preferencias de color/visibilidad. Si reaparece con el mismo nombre completo en el mismo repositorio, recuperarlas. Las referencias con nombres nuevos siguen D07. Un error de consulta no prueba eliminación. Git no aporta identidad durable de rama que permita deducir inequívocamente renombres externos; tratar nuevo nombre como nuevo salvo operación futura explícita que migre preferencias.
- Pregunta 38 respondida: «si, de acuerdo».
- **D39 — Carpetas virtuales por prefijos de ramas:** aprobado por David. Agrupar `feature/login`, `feature/search`, etc. bajo carpetas plegables por prefijo. Organización visual, sin referencia Git adicional. Buscar por nombre completo y conservar casillas por rama. No duplicar la activa si se destaca al inicio. Las remotas conservan además el nivel de remoto D32. Semántica de controles agregados de carpeta pendiente.
- Pregunta 39 respondida: «si, de acuerdo».
- **D40 — Casilla agregada de carpeta:** aprobado por David. Casilla de tres estados: todas encendidas, todas apagadas, selección parcial. Afecta solo a ramas descendientes; con búsqueda, solo coincidencias según D20. Plegar/desplegar no cambia filtros. Para estado parcial, seguir convención accesible de activar todas las afectadas; totalmente marcada desactiva todas. Identificar alcance/número en ayuda accesible; no añadir «Solo esta» a carpetas sin acuerdo.
- Pregunta 40 respondida: «si, de acuerdo».
- **D41 — Recencia explícita de tags/releases:** aprobado por David. Tags por fecha del commit de destino, indicando «Fecha del commit»; releases por fecha de publicación. No presentar ese dato como creación del tag. Tags sin commit resuelto no tienen fecha comparable; conservarlos como no navegables con explicación y orden secundario estable por nombre. El orden por versión semántica no se incorpora por inferencia.
- Pregunta 41 respondida: «si, de acuerdo».
- **D42 — Paleta nombrada y adaptable al tema:** aprobado por David. Selector de color por rama con colores nombrados y tonos adaptados a claro/oscuro, conservando identidad y legibilidad. Mantener nombres de ramas como señal adicional; no depender solo del color. Guardar identidad de paleta, no posición del carril. Colisiones con muchas ramas y evolución de paleta son detalles técnicos por resolver; no prometer colores únicos ilimitados.
- Pregunta 42 respondida: «si, de acuerdo».
- **D43 — Descarga explícita de adjuntos:** aprobado por David. «Descargar» por archivo de release, selector de destino, progreso y opción de cancelar. No abrir ni ejecutar automáticamente al terminar. Consultar release no descarga nada. Cancelar conserva filtros y detalle; respetar flujo de guardado para archivos existentes. Es aprobación de UX futura, no una descarga solicitada en esta auditoría.
- Pregunta 43 respondida: «si, de acuerdo».
- **D44 — Recuperar acceso GitHub sin perder contexto:** aprobado por David. Ante falta de acceso, «Conectar GitHub» / «Revisar acceso» reutiliza conexión existente y vuelve a Releases conservando repositorio, filtros y selección. Distinguir fallo de acceso de lista vacía. Cancelar vuelve al contexto anterior; historia local usable. Credenciales permanecen bajo la frontera Rust/keychain existente, no se duplican en filas ni se almacenan en preferencias del panel.
- Pregunta 44 respondida: «si, de acuerdo».
- **D45 — Apertura temporal sin fijar:** aprobado por David. Indicador de filtros durante diff abre temporalmente panel sin fijarlo, sin cerrar diff ni perder selección/scroll. Permitir cerrarlo tras ajustes; al abrir otro archivo volver a ocultarlo. «Fijar panel» es la acción explícita para mantenerlo abierto durante lectura; no inferir persistencia al reiniciar.
- Pregunta 45 respondida: «si, de acuerdo».
- **D46 — Principal ausente recuperable:** aprobado por David. Mantener gráfico/navegación utilizables con respaldo estable, mostrando «Rama principal no disponible · Elegir otra». No sustituir silenciosamente la preferencia ni ejecutar checkout. Conservar elección ausente hasta que el usuario elija otra; si reaparece antes, recuperar su rol (D38). Apagada por filtros no equivale a desaparecida (D37).
- Pregunta 46 respondida: «si, de acuerdo».
- **D47 — Búsqueda temporal por pestaña:** aprobado por David. Conservar búsqueda del panel al alternar pestañas durante la sesión; limpiarla al reiniciar. No modifica persistencia de referencias/énfasis D06. Al cerrar y volver a abrir una pestaña, iniciar sin búsqueda; no persistir foco/selección de texto.
- Pregunta 47 respondida: «si, de acuerdo».
- **D48 — Deshacer de varios pasos por sesión:** aprobado por David. Varios cambios visuales consecutivos, aislados por repositorio durante la sesión. Cada acción masiva es un paso. Limpiar pila al reiniciar conservando configuración final persistente. Restaurar preferencias no revierte novedades Git: referencias nuevas mantienen D07 y ausentes no reaparecen como filas ficticias. Límite de memoria acotado es decisión técnica.
- Pregunta 48 respondida: «si, de acuerdo».
- **D49 — Reutilización de paleta sin recolorear preferencias:** aprobado por David. Permitir repetir colores al agotar paleta y mantener nombres/etiquetas para distinguir ramas. Al asignar colores nuevos, intentar separar recorridos vecinos sin cambiar colores guardados. No prometer exclusividad ilimitada ni crear tonos arbitrarios casi indistinguibles. Local/upstream conserva D12.
- Pregunta 49 respondida: «si, de acuerdo».
- **D50 — Precedencia de color al vincular upstream:** aprobado por David. Unificar usando el color personalizado más recientemente elegido entre local/remota. Si solo una tiene personalización, conservarla; si ninguna, asignación automática estable. Cambiar después desde cualquiera actualiza ambas (D12). La resolución no depende del carril ni de visibilidad. Mostrar el resultado sin diálogo bloqueante es recomendación de implementación, no una pregunta adicional aprobada.
- Pregunta 50 respondida: «si, de acuerdo».

### Paso 5: consolidación de acuerdos

- Se crea `docs/plan/2026-10-18-panel-izquierdo-ui-ux.md` como especificación resumida de D01–D38 y matriz de aceptación futura.
- La bitácora conserva evidencia, cambios de recomendación y orden de respuestas; la especificación organiza el comportamiento acordado por flujos.
- Revisión de conexión existente: `GitHubPicker.tsx` contiene entrada/conexión de token y consulta de estado; reutilizar su frontera de credenciales es una opción técnica existente, no hace falta inventar otro formulario de credenciales en el panel. Integración de retorno a Releases sigue por diseñar.
- No se ejecutan consultas remotas, descargas, checkout ni cambios de UI durante la consolidación.

## 4. Hallazgos

### H01 — No existe control de visibilidad por rama o tag

- Tipo: capacidad ausente / UX.
- Síntoma: una fila únicamente permite navegar a su commit.
- Causa confirmada en código: `RefGroup` recibe `onOpen` y opcionalmente `onMenu`; no recibe estado ni acción de visibilidad.
- Impacto: bloquea el flujo solicitado de encender/apagar elementos; no bloquea la navegación existente.
- Alternativa manual: no hay filtro global de visibilidad equivalente; la búsqueda textual de commits no reemplaza selección de raíces Git.
- Destino de corrección: proyecto GitCanvas, una vez acordada la semántica.

### H02 — Faltan contribuyentes y versiones como categorías independientes

- Tipo: alcance de producto pendiente.
- Síntoma: el panel nativo solo lista Local, Remotas y Etiquetas.
- Causa confirmada: Sidebar.tsx:74–108 y refs.ts:29–57 solo conectan branches/tags. Los datos de autor en commits no constituyen un catálogo de contribuyentes.
- Impacto: impide filtrar por identidad; «versiones» necesita definición para no duplicar tags.
- Alternativa: la búsqueda global acepta texto de autor sobre historial cargado; no es una selección persistente de contribuyentes.
- Destino: GitCanvas. Acordar tags versionados frente a releases del proveedor y autor frente a committer/mailmap.
- Resolución de diseño: ambas categorías D04/D05; autor original y mailmap D09. Implementación pendiente.

### H03 — Carga, error y categoría vacía no se distinguen localmente

- Tipo: estado y recuperación de errores.
- Evidencia de código: Sidebar.tsx:69–70 y 102 usa `data ?? []`; RefGroup:157 devuelve null para lista vacía. No renderiza carga, error ni reintento de esas consultas.
- Causa: se consume data y se ignora el resto del estado de consulta.
- Impacto: una sección ausente no explica si no tiene elementos o falló. HistoryView sí tiene estados explícitos.
- Verificación: confirmación estática; no se inyectó un error IPC en el binario nativo ni se validaron banners globales durante un fallo.
- Alternativa: Actualizar puede disparar nuevas lecturas; recuperación de este caso no probada.
- Destino: GitCanvas, con carga/vacío/error/reintento por grupo o panel.

### H04 — Resaltado compartido no sirve como indicador de encendido

- Tipo: semántica de selección.
- Síntoma reproducido: varias refs del mismo commit se resaltan simultáneamente.
- Causa confirmada: Sidebar.tsx:164–172 compara target con selectedCommitId, no identidad de referencia.
- Impacto: comportamiento válido para señalar referencias del commit inspeccionado; ambiguo si se reutiliza como filtro o rama activa.
- Corrección candidata: distinguir HEAD, foco, commit inspeccionado y estado visible con señales independientes.
- Destino: GitCanvas. No se aplica cambio hasta acordar el modelo.

### H05 — Localizar y gestionar muchas referencias requiere recorrer la lista

- Tipo: descubribilidad y eficiencia.
- Síntoma: nombres largos truncados; no búsqueda propia, conteo, colapso o acciones de grupo. La barra sí admite scroll.
- Evidencia: captura nativa; Sidebar.tsx:161–228; Sidebar.css:1–2 y 74–77.
- Impacto: fricción con repositorios grandes; no se midió rendimiento con miles de refs.
- Alternativa actual: scroll y tooltip con nombre completo. Checkout se descubre por tooltip/clic derecho y teclado; no hay botón visible de acciones.
- Corrección candidata: búsqueda por nombre, secciones plegables, controles de grupo y menú visible coherente.
- Destino: GitCanvas.

### H06 — El panel se oculta al leer archivos y los futuros filtros no tienen persistencia definida

- Tipo: coherencia entre flujos.
- Evidencia estática: AppShell.tsx:152–157 oculta panel al leer archivo salvo pin; el control se expone en 233–244. Navigation tiene sidebarPinned y searchQuery, pero workspaceRecords.ts:74–79 no los guarda al reiniciar.
- Impacto: si el panel pasa a controlar filtros, el usuario puede perder su contexto visible durante la inspección. No implica que el pin actual deba persistir por contrato.
- Pendiente: probar ese recorrido nativo y decidir persistencia por repositorio, pestaña y reinicio.
- Destino: GitCanvas.

### H07 — El color actual identifica un carril, no una rama

- Tipo: diferencia entre representación actual y requisito R11.
- Evidencia confirmada por código: `src/lib/graph-layout/colors.ts:25–34` calcula color por índice de carril con una paleta cíclica; `GraphCanvas.tsx:77,85,97–98` usa lane/colorLane. Las etiquetas de commit usan estilos por tipo local/remoto/tag en `CommitTable.css:115–129`.
- Impacto: no hay contrato que conserve una identidad cromática de rama entre panel y gráfico ni al recalcular carriles por filtros. No atribuir un carril a una rama por su posición.
- Corrección candidata: identidad cromática persistente por rama, separada de geometría del layout; definir precedencia en historia compartida y merges antes de implementar.
- Verificación: estática; no se cambian colores ni layout.
- Resolución de diseño: D11–D14, D37, D42, D49–D50. Implementación pendiente.

## 5. Correcciones aplicadas

Se crean bitácora, evidencia y especificación consolidada. Para las pruebas se selecciona Node 22 instalado. No se modifican comportamientos de la aplicación durante la definición.

## 6. Evidencias

Las referencias de código y los resultados de pruebas se incorporan durante la investigación. Ninguna observación estática equivale a una prueba nativa end-to-end.

- Captura nativa local, no versionada: `evidence/2026-10-18-panel-izquierdo/tag-v0.3.0.png`. Se conserva en la máquina de la auditoría; el flujo de commit excluye binarios. La evidencia textual y las referencias al código sí quedan en este documento.
- Fuente: Sidebar.tsx, Sidebar.css, refs.ts, history.ts, navigation.ts, workspaceRecords.ts, AppShell.tsx y HistoryView.tsx.
- Evaluaciones independientes: diseño `/root/design_review`; detector/contratos `/root/evidence_review`. El agente principal ejecuta la prueba nativa. No se utiliza overlay web ni servidor de desarrollo: se inspecciona directamente el binario Tauri.

## 7. Trabajo pendiente

- Implementar los acuerdos D01–D50 de la [especificación](../plan/2026-10-18-panel-izquierdo-ui-ux.md) en una entrega posterior; esta auditoría no modifica la UI ni inicia esa entrega.
- Resolver el diseño técnico: evolución del workspace persistente, índices de contribuyentes/alcance, colores independientes del layout, consultas de releases, descarga de tags/adjuntos y límites de trabajo/memoria.
- Cerrar mediante implementación y pruebas los detalles operativos indicados como criterios técnicos en la especificación. No convertirlos en decisiones textuales de David ni añadir funciones nuevas por inferencia.
- Verificar los nuevos recorridos de navegación, teclado, errores, vacío, listas extensas y persistencia una vez implementados.
- Probar tamaño mínimo 940×600, tema claro, inglés y repo con miles de refs. Esta pasada nativa cubre español, oscuro y una ventana grande.
- No se comprobaron consola del webview, checkout real, pull, push, reinicio ni fallos IPC; no presentarlos como aprobados.

### Índice de decisiones cerradas

| Tema | Decisiones |
|---|---|
| Alcance, vacío, acciones y recuperación | D01, D03, D10, D15–D18, D20, D26–D29, D35, D48 |
| Contribuyentes e identidad | D02, D08–D09, D30, D33 |
| Persistencia, novedades y referencias reaparecidas | D06–D07, D38, D47 |
| Colores y principal visual | D11–D14, D37, D42, D46, D49–D50 |
| Releases, origen, red, tags y descargas | D04–D05, D22–D23, D31, D36, D43–D44 |
| Búsqueda, plegado, orden, carpetas y espacio del diff | D19, D21, D24–D25, D32, D39–D41, D45 |
| Futuras mejoras de gestión Git | D34 |

Se realizaron 50 preguntas de producto, una a la vez. Las recomendaciones rechazadas o reemplazadas están identificadas en el registro. Los pendientes históricos anotados junto a cada respuesta se resuelven mediante decisiones posteriores; este índice y la especificación reflejan el estado consolidado.

## 8. Oportunidades de automatización

- Pruebas de interacción y persistencia de los comportamientos que se acuerden.
- Cobertura de carga, error, vacío, refs compartiendo commit y navegación a commits no cargados.
- Fixture Git aislada: ramas divergentes e integradas, tips compartidos, tags anotados/no commit, HEAD detached, remotos simbólicos, autores con alias y nombres largos.
- Verificar que los filtros actúen sobre el recorrido completo y paginado, no solamente los primeros 500 commits; un cambio de filtros debe invalidar correctamente cursor y caché.

## 9. Resumen de la auditoría y definición

Funciona en la app: abrir pestaña, navegar a main y a un tag anterior, abrir y cancelar menú de checkout. Las 49 pruebas existentes seleccionadas pasan con Node 22. Se confirmó ausencia de visibilidad individual, contribuyentes/releases, búsqueda local y herramientas de grupo; colores actuales corresponden a carriles. Carga/error/vacío de refs no se distinguen en código. El ocultamiento del panel al abrir diff se conserva por preferencia explícita, no se corrige como defecto.

La entrevista cerró 50 acuerdos de producto consolidados en la especificación y su matriz de aceptación futura. Solo se corrigió el runtime usado para pruebas y se añadieron documentos/evidencia. No se implementaron funciones, no se ejecutaron operaciones Git mutadoras, no se hicieron commits ni publicaciones. Queda pendiente implementar y validar el nuevo panel; no presentar las pruebas actuales como cobertura de funciones futuras.
