# Protocolo de release

Una sola forma de llegar a `main`. Derivado de `docs/releasing.md` y de `CLAUDE.md` de
GitCanvas y de los skills `ci4-release` y `ci4-release-repo` del plugin ci4-kit.

## Ramas

- `main` nunca recibe commits directos. Su único commit propio es el que la creó.
- Todo el trabajo va a `dev`, que es permanente y nunca se borra después de un merge.
- `main` solo cambia por merge de un PR `dev` a `main`, y ese PR solo lo abre el flujo de
  release. El hook `pre-push` rechaza push a `main`.

## Pasos

1. **Auditar:** último tag en `main`, `git log main..dev`, estado del CHANGELOG. Saltar el
   repo si lo único pendiente son archivos de herramientas (AGENTS.md, GEMINI.md, capa de
   inteligencia) sin cambio funcional.
2. **Versión por SemVer** (`feat` sube minor, el resto patch; cambio incompatible antes de
   1.0 sube minor). **Confirmar con David antes de seguir.**
3. **Cierre documental** según la lista de cierre del [protocolo de trabajo](protocolo-trabajo.md#3-cierre-de-versión-una-sola-lista):
   manifiestos, CHANGELOG, README, roadmap, cola archivada, gates, ADR y verificación.
4. **Commit `chore: release vX.Y.Z`** como último commit de `dev`, y push.
5. **PR `dev` a `main`**, con el cuerpo igual a la sección del CHANGELOG, sin atribución de IA.
   **Parar y esperar la aprobación de David.**
6. **Revisar bots y CI** (Dependabot, CodeQL, escáneres): todo en verde. Si un bot marca un
   problema real, se arregla en `dev` antes del merge.
7. **Merge con `--merge`**, nunca `--squash` ni `--delete-branch`. Verificar que `dev` siga viva.
8. **Tag `vX.Y.Z` solo sobre `main`**, y push del tag. Nunca un tag en `dev`.
9. **El workflow `release.yml`** crea el GitHub Release extrayendo la sección del CHANGELOG.
   Nunca `gh release create` a mano. Si falta la sección `## [X.Y.Z]`, el workflow falla:
   no etiquetar sin ella. Si el release queda en borrador, publicarlo con
   `gh release edit vX.Y.Z --draft=false`.
10. **Verificar** el release (`gh release view`) y, si el paquete se publica en un registro
    (Packagist, npm), que la versión aparezca antes de actualizar a los consumidores.

## Reintentar un release fallido

No se borra ni se mueve un tag publicado. Se corrige la causa, se fusiona el arreglo a `main`
y se ejecuta de nuevo el workflow `release` sobre `main` con el tag existente.

## Repos con dependencias entre sí

Se publican en orden de dependencias (la librería antes que quien la consume). Para el
CI4 Enterprise Kit el orden es: `ci4-api-core`, `ci4-api-scaffolding`, los starters en
paralelo, `ci4-kickstart`. No se actualiza una restricción de Packagist hasta que Packagist
muestre la versión, y `composer.lock` se actualiza antes de abrir el PR del consumidor.

## Después de publicar una base

Cada release de una base abre tareas `BASE-UPDATE vX.Y a vZ` en sus derivados con la salida
de `base-drift`. Sin tag no hay release, y sin release no hay propagación.

## Comprobación automática

`dcl release-check <tag>` valida que el tag coincida con todos los manifiestos, que exista una
sección no vacía del CHANGELOG para esa versión y que el tag sea alcanzable desde `main`.
