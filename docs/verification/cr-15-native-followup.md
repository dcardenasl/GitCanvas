# CR-15: evidencia E2E nativa de seguimiento

Fecha: 2026-11-22. Plataforma: macOS, WebKit 605.1.15. Esta evidencia complementa
el veredicto independiente de [`cr-15-qa.md`](cr-15-qa.md); no lo reemplaza ni
convierte la matriz global de v0.9 en PASS.

## Alcance comprobado

- `cargo build --release --features e2e,tauri/custom-protocol` compiló el binario
  nativo de prueba. `cargo build --release -p gitcanvas --no-default-features`
  también pasó; el artefacto normal se compila sin el transporte E2E.
- `cargo test --release -p gitcanvas-core --features e2e` pasó: 144 pruebas,
  1 ignorada y 0 fallidas. Las pruebas nuevas rechazan origins no loopback,
  redirects de metadata antes de contactar el destino, URLs de asset fuera de
  la ruta/origen fijados y redirects binarios a otro puerto. El cliente E2E no
  tiene token ni proxy.
- El comando focal de WDIO para `e2e/authors-releases.spec.ts` pasó 4/4. El test
  nativo usa el servidor de `scripts/e2e-release-server.mjs`, enlazado a
  `127.0.0.1` y puerto efímero. Verificó listado/notas sintéticos, metadatos de
  assets y una descarga por IPC usando solo IDs. El servidor registró solo las
  rutas REST permitidas y ninguna cabecera `Authorization`; el archivo obtenido
  coincidió con los bytes sintéticos y su digest.
- El stub de `SaveDialog` existe solo con la feature `e2e`, solo cuando el
  transporte loopback validado está activo, y guarda bajo el `GITCANVAS_DATA_DIR`
  marcado como propiedad de WDIO. La ruta no llega por IPC. Esto permite probar
  resolver, descarga, digest, progreso y escritura a través del comando nativo,
  pero no equivale a probar el diálogo real del sistema.
- `npm run test:e2e` pasó Vite, compilación E2E release y el spec autores/releases
  (4/4). La corrida completa terminó con código 1 por fallos fuera de ese spec:
  graph-performance (timeout de 120 s), graph (dos fallos de preferencias),
  local-changes (tres fallos al cargar sus grupos), stash (altura de documento
  2972 frente al máximo 568) y workspace (un timeout de 120 s). Los otros specs
  que terminaron aparecen en la salida real de WDIO; no se atribuye un PASS global.
- Se regeneraron y revisaron visualmente estas capturas de 940×600, sin
  agregarlas al repositorio:
  `/var/folders/ln/y5fq9gts5jq4pwvszj8gvv0h0000gn/T/gitcanvas-cr15-en-light.png`,
  `.../gitcanvas-cr15-en-dark.png`, `.../gitcanvas-cr15-es-light.png` y
  `.../gitcanvas-cr15-es-dark.png`. Muestran el listado de release, notas,
  controles de autores y layout dentro del viewport.
- `npm run typecheck:e2e`, `cargo fmt --all --check` y la construcción Vite de
  `npm run test:e2e` pasaron. El build Vite conserva el aviso no bloqueante de
  chunk principal mayor a 500 kB.

## Límites y gates pendientes

- El spec prueba focusabilidad/`tabIndex` y usa foco explícito antes del atajo.
  La instrumentación observó `keydown` Tab sin `preventDefault`, pero WebDriver
  en WebKit/macOS no movió `document.activeElement` fuera del campo aun con
  `AppleKeyboardUIMode=3`. El valor se restauró al original (`0`). La secuencia
  real de Tab está cubierta por pruebas de componente; este harness no aporta
  evidencia confiable de navegación nativa por Tab.
- No se usó VoiceOver, NVDA u Orca. No se consultó GitHub real ni se usaron
  credenciales reales.
- El diálogo de guardar y la confirmación/renombrado reales no se verificaron;
  el stub aislado evita controlar o falsificar el diálogo del sistema. La
  verificación de rename en macOS, Linux y Windows sigue en
  `V09-VERIFY-CR15-DOWNLOAD-PLATFORMS`.
- La suite WDIO completa no queda en verde por los fallos enumerados arriba.
  Los screenshots y el spec focal pasan, pero no se infiere de ello que esas
  suites ni toda la matriz de accesibilidad pasen.

## Suites

Comandos ejecutados y resultado:

| Comando | Resultado |
|---|---|
| `cargo test --release -p gitcanvas-core --features e2e` | PASS — 144 passed, 1 ignored. |
| `cargo build --release --features e2e,tauri/custom-protocol` | PASS. |
| `cargo build --release -p gitcanvas --no-default-features` | PASS. |
| `npm run typecheck:e2e` | PASS. |
| `npm run test:e2e` | PARTIAL — build y spec focal 4/4 pasan; full WDIO exit 1 por otros specs. |

