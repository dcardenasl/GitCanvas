# GitCanvas: Snapshot

> Actualizado: 2026-11-23 · Lo escribe `cerrar-sesion`; lo lee `abrir-sesion` y `./dcl hoy`.
> Mantenerlo corto: esto no es un registro, es la forma de retomar en frío.

## Dónde quedé

CR-D22 quedó confirmado y el caso 38 está cerrado PASS bajo ese alcance. CR-17 está implementado; la matriz `quality #45093960516` pasó en Ubuntu/macOS/Windows; tests, WDIO y capturas macOS/WebKit pasaron. Se instaló el candidato 0.9.0 en `/Applications/GitCanvas.app` y se probó GitHub real v0.8.0: notas, enlace Markdown, descarga y renombrado del asset con SHA-256 coincidente. El flujo encontró y corrigió la falta de asociación del diálogo nativo con la ventana principal. La verificación global v0.9 sigue parcial; conservar el backup `.GitCanvas.app.pre-v0.9.0-20261123` y todos los artefactos del usuario.

## Próximo paso

Completar el cierre documental de v0.9.0, verificar nuevamente los gates y preparar commit de release y PR `dev → main`; detenerse antes del merge. El gate de descargas queda parcial: falta probar confirmación de sobrescritura y los diálogos Linux/Windows.

## Bloqueos

Siguen pendientes el aviso de sobrescritura y los diálogos Linux/Windows. VoiceOver/NVDA/Orca permanece aceptado por David como no verificado y documentado en README. La firma local de updater artifacts requiere `TAURI_SIGNING_PRIVATE_KEY`; no se generó updater firmado ni notarización.

## Decisiones pendientes de David

- David confirmó v0.9.0 y aceptar A11Y-LECTOR como no verificado el 2026-11-23. No volver a pedir esta decisión.
- El release fue autorizado para preparación; publicar requiere cerrar la revisión y aprobaciones del flujo de release. No hacer merge sin aprobación explícita.

## Verificado y no verificado

- `npm run test:coverage`: 108 archivos/999 tests; typechecks, lint, formato, build frontend, E2E 12/36, Cargo workspace/Clippy/deny y doc-check pasaron antes de la última corrección. `cargo fmt --all --check` y `cargo check --workspace` pasaron después de asociar el diálogo con la ventana principal. Evidencia instalada en `docs/verification/v0.9-macos-arm64-followup.md`.
- El candidato local instalado es 0.9.0 y tiene firma ad-hoc válida. Se preservó la instalación previa y el candidato reemplazado. No hay updater firmado ni notarización. Los diálogos Linux/Windows, sobrescritura y lectores reales no se probaron. No hay tag, GitHub Release ni merge; preparar el release/PR de acuerdo con el flujo y detenerse antes del merge.

## Comandos para retomar

```bash
git branch --show-current
git log --oneline -5
git status -sb
python3 .dcl/dcl.py doc-check
python3 .dcl/dcl.py gate-report
sed -n '80,125p' TASKS.md
```
