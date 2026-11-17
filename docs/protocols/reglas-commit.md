# Reglas de commit

Aplican siempre, se invoque el skill `commit-flow` o no. El hook `commit-msg` las hace cumplir.

```bash
git commit -m "type(scope): subject in english"
```

**Una sola línea. Un solo `-m`. En inglés. Imperativo. Minúscula después de los dos puntos.
Sin punto final.** Tipos permitidos: `feat fix docs chore refactor test perf style ci build`.

Antes de escribir un mensaje, mirar `git log --oneline | head -15` y calcar el estilo real del
repo. Si el historial del repo muestra otra convención, manda la del repo.

| Prohibido | Por qué |
|---|---|
| Cuerpo del mensaje o texto tras la primera línea | Una línea, siempre; el detalle vive en el CHANGELOG |
| Cualquier trailer (`Co-Authored-By` incluido) | Sin atribución de ningún tipo |
| Mencionar Claude, AI o Anthropic, en el commit, el PR o el tag | El repo lo prohíbe |
| Mensajes en español | El historial va en inglés |
| `--no-verify` | Los hooks detectan problemas reales; se arreglan, no se saltan |
| `--amend` después de que falle un hook | Se crea un commit nuevo |
| `git add .` o `git add -A` | Se nombran los archivos uno por uno |
| Asuntos vagos (`fix bug`, `update code`) | Qué cambió y dónde |

Nunca, sin confirmación explícita de David: `git reset --hard`, `git clean -fd`,
`git push --force`, `git checkout -- .`.

Si un hook falla: mostrar el error, arreglar la causa y crear un commit nuevo. Nunca revertir
con comandos destructivos.

**Una tarea, un commit,** y la tarea se marca `[x]` en `TASKS.md` en ese mismo commit.

**CHANGELOG:** solo para cambios que un usuario nota (`feat`, `fix`, `perf`). Se agrega bajo la
versión no publicada que ya exista; nunca se inventa un número de versión nuevo. Formato del
bullet: `- **NombreOEndpoint**: qué cambió y por qué importa. Una frase, concreta.`
