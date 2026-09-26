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
        uses: owner/repo@v1        # en este repo: ./action
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

| Input | Default | Descripción |
|---|---|---|
| `path` | `.` | Archivo o directorio de specs a analizar |
| `fail-on` | `error` | Umbral del gate: `error` \| `warning` \| `info` \| `never` |
| `format` | `sarif` | Artefacto a producir: `sarif` \| `json` \| `none` |
| `cli` | `npx -y @apigovscan/cli` | Comando CLI a invocar (dogfood: `node packages/cli/bin/apigovscan.js`) |
| `rules` | `""` | Rutas a reglas custom, separadas por espacios |
| `config` | `""` | Ruta a `apigovscan.yaml` (opcional) |
| `baseline` | `false` | Aplicar baseline (`true`/`false`) |
| `license-key` | `""` | License key (también vía `APIGOVSCAN_LICENSE_KEY` o config `license.key`) |

## Outputs

| Output | Descripción |
|---|---|
| `sarif-path` | Ruta del artefacto (`apigovscan.sarif` o `apigovscan.json`; vacío si `format: none`) |
| `exit-code` | Exit code del gate: `0` ok · `1` findings ≥ `fail-on` · `2` error |

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
