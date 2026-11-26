# Protocolo de presupuesto de GitHub Actions

Este protocolo protege la capacidad de publicación de todos los proyectos DCL. Se aplica
a cada repositorio de la cartera y complementa el [protocolo de release](protocolo-release.md)
y el [protocolo del roadmap](protocolo-roadmap.md).

La cartera `portfolio.yaml` define los repositorios administrados por el ciclo DCL. Si `dcl intake`
encuentra repositorios externos con workflows, el informe mensual los señala para decisión de
adopción; no se cambian sus disparadores o despliegues sin esa decisión y sus compuertas de
cliente.

## Unidad de presupuesto

El presupuesto se mide en la cuenta que factura el repositorio y en su ciclo de facturación,
no como una cuota independiente por proyecto. Al inicio y al cierre de cada ciclo, y antes de
una jornada de publicación, se registra en el informe de mantención:

- minutos incluidos y fecha de reinicio, según Billing de GitHub;
- minutos consumidos por repositorio y workflow, según Usage y el resumen de cada ejecución;
- proyección de uso hasta el reinicio, incluidas las publicaciones ya previstas;
- workflows privados de mayor costo y acciones adoptadas.

Los minutos mostrados por algunas métricas no incluyen multiplicadores de sistema operativo.
Para estimar el costo de matrices, se suman los minutos facturables de cada trabajo y se aplica
el multiplicador mostrado por Billing. No se presenta una cifra como saldo real si no se leyó
en la cuenta de facturación.

## Reserva de publicación

Antes de consumir minutos en ejecuciones manuales, el responsable conserva una reserva igual
al costo estimado de las puertas obligatorias que faltan en el ciclo: un PR de calidad por cada
repositorio privado que se publicará, las repeticiones justificadas por fallos corregibles y
los workflows de tag. La estimación usa las ejecuciones recientes comparables, incluidas sus
matrices y multiplicadores. Si no hay historial, se registra el saldo como desconocido y no
se lanzan workflows manuales no esenciales hasta medir una corrida.

No se habilita facturación adicional ni se cambia el método de pago para superar la cuota sin
una decisión explícita de David. Los repositorios públicos conservan sus propias reglas de
privacidad; nunca se cambia un repositorio privado a público para evitar cargos.

## Cuando el saldo no alcanza

1. Pausar PR de release y tags en repositorios privados; no se considera publicada una versión
   porque el código esté listo localmente.
2. Continuar el trabajo local y determinista de la versión siguiente que ya esté en el roadmap.
   Mantener cada tarea ligada a su versión objetivo y sus criterios de aceptación.
3. Al planificar la siguiente versión publicable, agrupar las funcionalidades acordadas que
   ya estén listas. Si la siguiente versión todavía no tiene alcance aprobado, promover las
   candidatas mediante el protocolo de roadmap antes de implementarlas.
4. Si se agotan las candidatas aprobadas, llevar ideas nuevas a Reserva y pedir la decisión de
   David. No ampliar una versión en curso, implementada o publicada por inferencia.
5. Al renovarse el saldo, ejecutar los gates pendientes en el orden de dependencias. Publicar
   solo tras CI verde, QA, Validador y las compuertas humanas habituales.

La falta de minutos cambia el orden del trabajo y puede hacer que la siguiente publicación
incluya más funcionalidades previamente aprobadas. No relaja los criterios de aceptación ni
convierte trabajo sin verificar en release.

## Reglas para Dependabot

- Las actualizaciones rutinarias de versión apuntan a `dev`; no se abren contra `main`.
- Agrupar actualizaciones menores y de parche por ecosistema, mantener las mayores separadas
  cuando haya incompatibilidades o revisión manual y limitar a tres PR rutinarios abiertos por
  ecosistema.
- Ejecutar la actualización rutinaria una vez al mes y revisar los grupos durante la jornada
  de mantención del proyecto.
- Mantener habilitadas las alertas y actualizaciones de seguridad. Las PR de seguridad pueden
  dirigirse a la rama predeterminada aunque las actualizaciones rutinarias apunten a `dev`, y
  pueden activar CI. Darles prioridad sobre el trabajo manual; una corrección crítica se
  escala de inmediato y sigue los gates normales. Cualquier gasto adicional requiere la
  decisión de David.
- La ejecución estándar de Dependabot no descuenta los minutos incluidos; los workflows del
  repositorio que se disparen en sus PR sí pueden consumirlos. Al dirigir sus PR rutinarios a
  `dev`, la regla de CI local evita ese gasto automático. Las PR de seguridad se presupuestan
  aparte. Ver [Dependabot en runners de Actions](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-on-actions).
- Revisar las actualizaciones agrupadas en la mantención mensual. No acumular PR obsoletos:
  cerrar o reemplazar los grupos que hayan quedado superados.

## Reglas de workflows

- Mantener CI en PR a `main` y en tags de release. `dev` se protege con hooks y comandos locales.
- Usar `workflow_dispatch` solo para diagnosticar o verificar una publicación, y únicamente
  cuando la reserva siga cubierta. No ejecutar matrices completas por comodidad.
- Usar `concurrency` con cancelación para sustituir trabajo obsoleto. Cachear dependencias,
  evitar instalaciones repetidas y compartir artefactos entre trabajos cuando no cambie la
  confianza del resultado.
- Mantener matrices solo para sistemas operativos que el producto soporte o cuyos riesgos
  requieran una comprobación separada. Activar cancelación rápida si falla una plataforma y la
  decisión de parar el resto no elimina evidencia que el release necesite.
- Tras un fallo, corregir localmente y volver a ejecutar solo el trabajo fallido cuando GitHub
  lo permita y la evidencia de los trabajos aprobados siga vinculada al mismo SHA.
- No añadir schedules, pushes a ramas ni PR hacia `dev` sin una decisión registrada de David.

## Evidencia y revisión

La revisión mensual de cartera registra saldo, consumo, reserva, proyección, repositorios con
actualizaciones pendientes de Dependabot y cualquier excepción. Si Billing o las métricas de
un repo no están disponibles, se declara el hueco y no se inventa una cifra. `workflow-check`
verifica los disparadores; `doc-check` verifica los documentos del ciclo.

Referencias de GitHub: [facturación y uso](https://docs.github.com/en/actions/concepts/billing-and-usage),
[facturación de Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
y [tiempo de ejecución facturable](https://docs.github.com/en/actions/how-tos/viewing-workflow-run-history/viewing-job-execution-time).
