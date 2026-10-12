# TASKS — GitCanvas

> Fuente de verdad para el trabajo pendiente. Convenciones y contexto para sesiones nuevas:
> [`CLAUDE.md`](CLAUDE.md). Tareas completadas, con su evidencia: [`ARCHIVES.md`](ARCHIVES.md).
> Planes: [endurecimiento H2](docs/plan/2026-10-04-plan-de-endurecimiento.md),
> [tres funcionalidades](docs/plan/2026-10-08-plan-tres-funcionalidades.md) y el
> [plan general](docs/plans/2026-09-08-plan-de-implementacion.md).

**Estado al 2026-10-12:** v0.1.0 está publicado (tag sobre `main`, instaladores de Linux, macOS
y Windows). La fase H2 está cerrada, 46 de 46 tareas, y archivada. Queda abierta la
internacionalización en lo que le falta de verificación (I18N-6) y el cierre de la ficha del
asset (R-6). Las secciones 2 (commits desde la interfaz) y 4 (pestañas, favoritos y
persistencia) del plan de tres funcionalidades todavía no tienen tareas.

**Estado del checkout:** `dev` está publicado y abierto en la
[PR #9](https://github.com/dcardenasl/GitCanvas/pull/9) hacia `main`, con el trabajo de
internacionalización. Antes de editar, inspeccionar `git status` y el historial.

## Siguiente paso

1. Esperar el run de `quality` de la PR #9 y, con él, cerrar **I18N-6** (E2E en Linux y
   Windows, que no se pueden ejecutar localmente desde macOS).
2. Cerrar **R-6** (ficha del asset) con el commit indicado en su tarea.
3. Planificar las secciones 2 y 4 del plan de tres funcionalidades y convertirlas en tareas
   aquí antes de implementarlas. El orden de entrega del plan es: fundamentos de workspace y
   persistencia, internacionalización (hecha), pestañas y favoritos, preparación y commits.

## Cola de trabajo

1. **I18N-6 — Evidencia multiplataforma de la internacionalización.**
2. **R-6 — Ficha del asset.**

## Cómo se usa este archivo

- **Una tarea = un commit.** El ID de la tarea es estable para siempre: no se renumera
  nunca, y si se cancela se deja `~~tachada~~` con el motivo.
- **Cada tarea se marca `[x]` en el mismo commit que la implementa.** Nunca por lotes al
  final: el valor del archivo es que su estado sea cierto en cualquier punto del
  historial, para que una sesión nueva haga `git pull` y sepa exactamente dónde está.
- Cuando aparece algo que el plan no previó, se anota bajo la tarea con
  `*Hallazgo durante la ejecución:*`. Eso evita que la próxima sesión repita el error.
- La flecha `→` de cada tarea es el mensaje de commit exacto que le corresponde.

---

## Fase I18N — Internacionalización

Plan rector: sección 3 de
[`docs/plan/2026-10-08-plan-tres-funcionalidades.md`](docs/plan/2026-10-08-plan-tres-funcionalidades.md)
(decisiones en [ADR 0004](docs/adr/0004-internationalization.md)). I18N-1 a I18N-5 están
completadas y archivadas en [`ARCHIVES.md`](ARCHIVES.md). Las secciones 2 (commits desde la
interfaz) y 4 (pestañas, favoritos y persistencia) del plan siguen sin tareas ni
implementación.

- [ ] **I18N-6 — Verificar la internacionalización en Linux y Windows.** Obtener una corrida
      de `quality` sobre el código vigente y confirmar `test:coverage`, `typecheck*`, `lint` y
      E2E en los tres sistemas. *Verificado localmente solo en macOS (2026-10-12):* 402
      pruebas, cobertura, `tsc` (app, e2e y node), ESLint, Prettier y 4 specs E2E. Riesgos
      cubiertos por inspección: mayúsculas de imports contra el disco, finales de línea
      (`.gitattributes`), icono SVG en lugar del glifo ⚙, y fijación del idioma del E2E
      mediante `change` en el `<select>` en vez de clic en su popup nativo. Sin verificar: el
      renderizado de `Intl` (`style: unit`, porcentajes) en WebKitGTK y WebView2, y la barra a
      940 px en esos motores.
      → `docs(tasks): record cross-platform i18n verification`

---

## 🔴 Pendiente — Release v0.1.0

> Ejecutado con el skill `/release`. Ver `CLAUDE.md` para el procedimiento completo.
> R-1 a R-5 están completadas y archivadas en [`ARCHIVES.md`](ARCHIVES.md).

- [ ] **R-6 — Actualizar la ficha del asset.** `docs/ASSET.md` y `docs/SNAPSHOT.md`:
      versión, repositorio, estado del build por componente y log de avances.
      → `docs(asset): record the v0.1.0 release in the asset sheet`
