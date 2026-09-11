# GitCanvas

> Cliente Git visual estilo GitKraken, enfocado en el graph de branches y commits: abrir un repo (local o de GitHub) y recorrer visualmente su historial rama por rama.

---

## ⚡ Retomar en 30 segundos

| Campo | Valor |
|---|---|
| **Versión actual** | v0.1.0 |
| **Estado** | MVP funcional en endurecimiento |
| **Última sesión** | 2026-09-11 |
| **¿Dónde quedé?** | Funcionalidad de historial, graph, detalle de commits y cambios locales con contratos Specta, límites de recursos, watcher generacional y fallback por fingerprint. |
| **Próximo paso concreto** | Validación completa de release en macOS y mantenimiento de la matriz de pruebas |
| **Bloqueante activo** | Ninguno |

---

## Ficha del asset

| Campo | Valor |
|---|---|
| **Slug** | gitcanvas |
| **Tipo** | Aplicación de escritorio (herramienta de desarrollo) |
| **Visibilidad** | Privado (uso personal por ahora, evaluar abrir a otros devs más adelante) |
| **Repositorio** | GitCanvas local |
| **Licencia** | Pendiente de definir |
| **Inicio** | 2026-09-08 |
| **Versión actual** | v0.1.0 |
| **Stack** | Tauri v2 + Rust (backend, vía `git2`/libgit2) + React + TypeScript (frontend: layout del graph + render SVG) |

---

## Qué hace / Qué resuelve

**Problema que resuelve:**
Revisar el historial de branches y commits de los repos propios (CI4 Enterprise Kit y sus derivados: ci4-website-suite, ci4-admin-starter, etc.) de forma visual, sin depender de una herramienta comercial como GitKraken. El valor central no es reemplazar todas las funciones de un cliente Git completo, sino resolver muy bien el aspecto que más aporta: ver el árbol de ramas y commits de un vistazo.

**Cómo funciona (en 3-5 pasos):**
1. Se abre un repo local existente (o se clona uno de GitHub, público o privado, a una caché local de la app).
2. El backend en Rust camina el historial con `git2` y entrega al frontend una lista plana de commits: hash, mensaje, autor, fecha, padres y qué refs (branches/tags) apuntan a cada uno.
3. El frontend (TypeScript) calcula el layout del graph: en qué carril va cada commit y cómo se dibujan las líneas en los merges.
4. Se renderiza el graph en SVG, con virtualización de filas para no montar miles de nodos DOM de una vez.
5. (Fase posterior) Click en un commit abre un panel de detalle con el diff de archivos modificados.

**Casos de uso actuales:**
- Revisar branch por branch el historial de ci4-website-suite, ci4-admin-starter y otros repos del CI4 Enterprise Kit.

---

## Proyectos que lo usan

| Proyecto | Tipo | Versión usada | Notas |
|---|---|---|---|
| - | - | - | Aún en diseño, sin build |

---

## Estado del build

| Componente | Estado | Descripción |
|---|---|---|
| Definición de arquitectura y stack | ✅ | Cerrada |
| Scaffold Tauri v2 + Rust + React/TS | ✅ | Base funcional |
| Backend Rust: lectura de commits/branches/refs vía `git2` | ✅ | Contratos tipados y paginación |
| Algoritmo de layout del graph (carriles, líneas de merge) en TS | ✅ | Función pura con cobertura dedicada |
| Render del graph en SVG con virtualización de filas | ✅ | Historial navegable |
| Panel de detalle de commit + diff | ✅ | Diff y contenido bajo demanda |
| Cambios locales staged/unstaged/untracked | ✅ | Snapshot, límites, seguridad y watcher |
| Integración GitHub | ✅ | Token en keychain y clone local |
| Acciones básicas (checkout, pull, push) | ✅ | Operaciones con confirmación |

---

## Roadmap

### Próximas mejoras (corto plazo, MVP)
- [x] Fase 0: scaffold Tauri v2 + Rust + React/TypeScript
- [x] Fase 1: backend Rust con `git2` que camina el historial y expone commits/branches/refs
- [x] Fase 2: algoritmo de layout de carriles en TypeScript + render del graph en SVG con virtualización
- [x] Fase 3: panel de detalle de commit con diff y contenido bajo demanda
- [x] Fase 4: integración GitHub mediante clone local completo
- [x] Fase 5: acciones básicas: checkout de branch, pull, push
- [ ] Endurecimiento continuo: ampliar E2E real y validación de release por plataforma

### Ideas para el futuro (largo plazo)
- Undo/redo de operaciones git estilo GitKraken
- Secciones adicionales en el sidebar: worktrees, pull requests, issues, tags
- Migrar el render (y eventualmente el layout) de SVG a Canvas si un repo muy grande muestra problemas de performance
- Evaluar abrir el proyecto (open source o distribución a otros devs) si el asset demuestra suficiente valor de uso propio

---

## Historial de versiones

| Versión | Fecha | Cambios principales |
|---|---|---|
| v0.0 | 2026-09-08 | Diseño inicial: propuesta de valor, stack, arquitectura y fases definidas |

---

## Documentación

| Recurso | Estado | Ruta / URL |
|---|---|---|
| README | ⏳ | - |
| Guía de instalación | ⏳ | - |
| Ejemplos / demos | ⏳ | - |
| Plan de desarrollo detallado | ✅ | PLAN-DESARROLLO.md |
| Mockup visual (HTML) | ✅ | mockup.html |

---

## Adopción y visibilidad

| Métrica | Valor | Fecha |
|---|---|---|
| Proyectos propios que lo usan | 0 | 2026-09-08 |
| Proyectos externos que lo usan | 0 | 2026-09-08 |

---

## Potencial de monetización

> Completar solo si se está evaluando convertir el asset en un producto o servicio.

**Decisión actual:** No monetizar: es una herramienta de uso personal para revisar los propios repos. Reevaluar si en algún punto el MVP resulta lo suficientemente sólido como para que otros devs quieran usarlo.

---

## Log de avances

- 2026-09-08: Mockup visual de la interfaz guardado en mockup.html (autocontenido, abrir directo en el navegador). Muestra sidebar (branches local/remote + GitHub marcado como fase 4), el graph con el flujo de PR mergeada a main y dev bifurcandose de nuevo para seguir trabajando, y el panel de detalle con diff. Datos de ejemplo tomados del historial real de ci4-website-suite.
- 2026-09-08: Plan de desarrollo detallado creado (PLAN-DESARROLLO.md): principios rectores contra deuda técnica, estructura del proyecto, contratos de datos Rust/TypeScript generados automáticamente (specta), arquitectura de cada fase con decisiones técnicas cerradas (paginación por cursor, spawn_blocking para git2, algoritmo de layout como función pura, almacenamiento seguro de tokens, política de retención de caché), estrategia de testing por pirámide, pipeline de CI/CD, riesgos identificados con mitigación y métricas de éxito concretas (performance budget).
- 2026-09-08: Sesión de diseño completa. Propuesta de valor definida: cliente Git visual estilo GitKraken con foco en el graph de branches y commits (no en replicar todas las funciones de GitKraken). Stack elegido: Tauri v2 + Rust + React/TypeScript. Decisiones de arquitectura: Rust se encarga solo de los datos (vía `git2`), TypeScript calcula el layout del graph, SVG con virtualización de filas para el render. Estrategia de GitHub definida: unificar repos públicos y privados bajo un clone local, sin construir un segundo camino de datos vía API. Fases priorizadas con el graph visual como núcleo del MVP (fase 2), antes que el panel de diff (fase 3). Nombre elegido: GitCanvas.

---

*VentureOS · Asset creado: 2026-09-08 · Última actualización: 2026-09-08*
