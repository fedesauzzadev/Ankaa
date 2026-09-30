# ApiGovScan Action

GitHub Action (composite) que corre el **mismo CLI** de este repo — cero lógica duplicada.
Publica **anotaciones en el PR**, un **job summary** en Markdown y un **artefacto SARIF/JSON**,
con gate configurable por `fail-on`. Funciona **sin code scanning** (el gate es el exit code).

## Uso

```yaml
name: API governance
on: [pull_request]

jobs:
  apigovscan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: ApiGovScan
        id: apigovscan
        uses: owner/repo@v1 # en este repo: ./action
        with:
          path: specs/
          fail-on: error

      # Opcional: subir SARIF a code scanning (el gate no lo necesita)
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.apigovscan.outputs.sarif-path }}
```

`if: always()` en el upload es importante: `sarif-path` se escribe en el **paso 1 (artifact)**,
antes del gate, así que el artefacto existe aunque el job falle.

## Inputs

| Input         | Default                  | Descripción                                                               |
| ------------- | ------------------------ | ------------------------------------------------------------------------- |
| `path`        | `.`                      | Archivo o directorio de specs a analizar (en modo review: el contrato candidato) |
| `fail-on`     | `error`                  | Umbral del gate: `error` \| `warning` \| `info` \| `never`                |
| `format`      | `sarif`                  | Artefacto a producir: `sarif` \| `json` \| `none`                         |
| `cli`         | `npx -y @apigovscan/cli` | Comando CLI a invocar (dogfood: `node packages/cli/bin/apigovscan.js`)    |
| `rules`       | `""`                     | Rutas a reglas custom, separadas por espacios (solo modo analyze)         |
| `config`      | `""`                     | Ruta a `apigovscan.yaml` (opcional)                                       |
| `baseline`    | `false`                  | Aplicar baseline (`true`/`false`; solo modo analyze)                      |
| `review-ref`  | `""`                     | **Modo review:** ref git (branch/tag/SHA) con el contrato base; vacío = modo analyze |
| `license-key` | `""`                     | License key (también vía `APIGOVSCAN_LICENSE_KEY` o config `license.key`) |

## Outputs

| Output       | Descripción                                                                          |
| ------------ | ------------------------------------------------------------------------------------ |
| `sarif-path` | Ruta del artefacto (`apigovscan.sarif`/`apigovscan.json`; `apigovscan-review.json` en modo review; vacío si `format: none`) |
| `exit-code`  | Exit code del gate: `0` ok · `1` findings ≥ `fail-on` · `2` error                    |

## Cómo funciona

Tres corridas del mismo CLI (sin lógica propia en el action):

1. **artifact** — `--format sarif|json --output … --fail-on never` ⇒ artefacto siempre disponible.
2. **annotations** — `--format annotations --fail-on never` ⇒ `::error/::warning/::notice` en stdout
   ⇒ GitHub publica anotaciones inline en el diff.
3. **job summary + gate** — `--format markdown --fail-on <umbral>` ⇒ resumen en `$GITHUB_STEP_SUMMARY`
   y el exit code real del CLI falla (o no) el job.

Notas:

- `${{ inputs.* }}` solo se pasa por `env:` (nunca dentro de `run:`) — sin injection de inputs.
- Los reportes salen **redactados** por defecto (FR-43): el artefacto subido no lleva secretos.
- Determinismo (INV-2): mismos inputs ⇒ mismo SARIF byte a byte.

## Modo review (gate de cambios de API, f14)

Con `review-ref` definido, la Action revisa **el candidato final del check** (el checkout
del PR/push) contra el contrato base extraído de ese ref git — el **mismo evaluador** que
`apigovscan review` y la tool MCP `review_api_change`:

```yaml
name: API change review
on: [pull_request]
permissions:
  contents: read
jobs:
  apigovscan-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: ApiGovScan review
        id: review
        uses: owner/repo@v1 # en este repo: ./action
        with:
          path: openapi.yaml
          review-ref: main
          fail-on: error
```

Comportamiento:

1. **review-base** — `git fetch --depth=1 origin <review-ref>` + `git show FETCH_HEAD:<path>`
   ⇒ contrato base en un temp dir. Si el archivo no existe en ese ref (contrato nuevo),
   el job falla con exit 2 y un mensaje explícito: para contratos nuevos usá el modo
   analyze (sin `review-ref`).
2. **artifact** — `review base candidate --format json --fail-on never` ⇒ `apigovscan-review.json`
   (schemaVersion 1, hashes, comparabilidad, findings). Si `format: none`, se salta.
3. **annotations** — se salta en modo review (`review` no tiene formato annotations).
4. **gate** — `review base candidate --fail-on <umbral> --format console` ⇒ job summary
   "ApiGovScan API change review" + exit code real (`0` clean · `1` findings ≥ umbral ·
   `2` error operativo, incluida comparación no soportada — nunca se reporta como limpia).

Restricciones del modo review: `path` debe ser un **archivo** (no directorio); `rules` y
`baseline` no aplican (reglas custom van por `config customRules`); la comparación
base-candidato soporta OpenAPI/Swagger (otros protocolos fallan honesto con exit 2).
Cada corrida re-revisa el estado actual del checkout: los re-runs vuelven a evaluar el
SHA final, sin caché ni resultados stale.

### Configurarlo como required status check

Publicar el check y volverlo **required** son cosas distintas:

1. Corre el workflow en un PR ⇒ GitHub crea el check (nombre = nombre del **job**,
   p. ej. `API change review`).
2. Repo → **Settings → Branches → Add branch protection rule** (o rulesets) para `main` →
   **Require status checks to pass before merging** → seleccioná el nombre del job.
3. Recién después de que el check corre al menos una vez aparece en la lista.

Límites a conocer:

- **Bypass:** con branch protection clásica, **admins pueden saltear** el check salvo que
  marques "Do not allow bypassing the above settings" (o incluyas a todos en la regla).
  En rulesets, "Bypass list" controla quién puede. Repository admins siempre pueden
  editar/deshabilitar la regla.
- `push` directo a `main` (sin PR) no corre el check salvo que el workflow también
  dispare en `push` y la regla lo exija.
- Un required check bloquea el merge, no reescribe commits ni fuerza fixes; es
  verificación, no mutación.
- Re-runs ("Re-run jobs") vuelven a ejecutar la revisión sobre el mismo SHA candidato.
