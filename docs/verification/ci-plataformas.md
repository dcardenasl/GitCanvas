# Evidencia de CI en Linux, macOS y Windows

Registro del 2026-11-16. Cierra la parte de plataformas de los gates GRF-5, V05-VERIFY,
V07-VERIFY y V08-VERIFY. Cada versión se respalda con **su propia** corrida de `quality`
sobre el PR de release (nunca se infiere una versión de otra). El workflow ejecuta la suite
E2E nativa en `ubuntu-latest` (con `xvfb`), `macos-latest` y `windows-latest`
([`quality.yml`](../../.github/workflows/quality.yml)).

## Corridas

| Versión | PR de release           | Corrida     | Commit      | Linux | macOS | Windows |
| ------- | ----------------------- | ----------- | ----------- | ----- | ----- | ------- |
| v0.4.0  | `chore: release v0.4.0` | 39204141005 | `081199a5d` | éxito | éxito | éxito   |
| v0.5.0  | `chore: release v0.5.0` | 40452712115 | `839fbf7b2` | éxito | éxito | éxito   |
| v0.7.0  | `chore: release v0.7.0` | 42716393105 | `69923feb9` | éxito | éxito | éxito   |
| v0.8.0  | `chore: release v0.8.0` | 43787989991 | `05694bfea` | éxito | éxito | éxito   |

## Verificación previa a release v0.9

La corrida [`quality #45093960516`](https://github.com/dcardenasl/GitCanvas/actions/runs/45093960516)
se despachó sobre `dev` en el commit `5cdc6dd` (no fue una corrida de PR de release). Pasó
tests Rust, Clippy, bundles y E2E nativo en Ubuntu, macOS y Windows. Se usa como evidencia de
`V09-VERIFY-PLATFORM-MATRIX`; no prueba el diálogo nativo de guardar/renombrar ni lectores de
pantalla reales.

Reproducir una fila:

```bash
gh run view 43787989991 --json jobs --jq '.jobs[] | select(.name|startswith("quality")) | .name as $n | [.steps[] | select(.name|test("end-to-end";"i")) | select(.conclusion!="skipped") | "\(.name): \(.conclusion)"] | "\($n) -> \(join("; "))"'
```

## Qué demuestra y qué no

- Demuestra que la suite E2E nativa del PR de release pasó en las tres plataformas con el
  código de ese commit.
- No demuestra el uso con un lector de pantalla real ni los recorridos manuales de v0.4
  (GRF-5). Ambos quedan como no verificados por decisión de David (2026-11-16) y se anotan en
  «Known limitations» del README; ver el gate `A11Y-LECTOR` en [`TASKS.md`](../../TASKS.md).

## Límites y gates pendientes

- Lector de pantalla real (VoiceOver, NVDA, Orca): sin evidencia; aceptado como no verificado.
- Recorridos manuales de v0.4 (GRF-5): sin evidencia; aceptados como no verificados.
