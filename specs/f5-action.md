# f5-action · GitHub Action oficial (`apigovscan-action`)

| Campo     | Valor                                                                    |
| --------- | ------------------------------------------------------------------------ |
| Estado    | cerrada                                                                  |
| Fase      | 5                                                                        |
| Deriva de | SDD FR-42/40, SDD §7 fila 5; doc 05 §3; doc 06 §8.6; spec `f5-reporters` |
| Artefacto | `action/action.yml` (composite)                                          |
| Roadmap   | Fase 5 — Reporters SARIF + Markdown + GitHub Action                      |

## 1. Objetivo

Como **dev con repo en GitHub**, quiero un check de PR que publique **annotations en el diff**, un **job summary** y el **artefacto SARIF**, con gate por `fail-on` — corriendo **el mismo CLI** (sin lógica duplicada) y funcionando también sin code scanning.

**User story canónica:**

> Given un workflow con `uses: <repo>/action@v1` y `fail-on: error`,  
> When corre el check sobre mis specs,  
> Then el PR muestra anotaciones inline, el job tiene el resumen Markdown, existe `apigovscan.sarif` como output, y el job **falla** solo si hay findings ≥ umbral.

## 2. Alcance

### Dentro

- `action/action.yml` **composite** que invoca al CLI de este monorepo (un `analyze` para el artefacto, uno para annotations, uno para summary+gate — misma binaria, cero lógica propia).
- Inputs `path`, `fail-on`, `format`, `cli`, `rules`, `config`, `baseline`.
- Outputs `sarif-path`, `exit-code`.
- Seguridad de interpolación: `${{ inputs.* }}` **solo** en bloques `env:`, nunca dentro de `run:`.
- Redacción por defecto (FR-43/doc 06 §8.6): el artefacto sale del CLI ya redactado.
- Dogfood: workflow `.github/workflows/apigovscan.yml` que usa `uses: ./action` sobre un fixture.
- `action/README.md` con snippet de uso + nota de upload SARIF opcional.

### Fuera (explícito)

- `github/codeql-action/upload-sarif` como paso nuestro: el snippet de doc 05 lo deja **opcional** en el workflow del usuario (upload con `if: always()` documentado, no incluido en dogfood).
- Lógica de reglas/serialización/exit codes en el action (todo lo hace el CLI; INV-3/INV-7 intactos).
- Input `standards-version` de doc 05 §3: **diferido** — no existe flag CLI de pin de packs hasta el registry (fase 6); se ajusta el snippet de doc 05 al cierre.
- Publicación a Marketplace / tag `v1` remoto: este repo publica el action **in-repo** (`./action`); el `apigovscan/action@v1` de doc 05 es el UX target cuando haya repo dedicado (ver §7).

## 3. Contrato

### `action/action.yml`

```yaml
name: "ApiGovScan"
description: "Local-first API governance check for OpenAPI specs (SARIF, annotations, job summary)"
branding:
  icon: shield
  color: purple

inputs:
  path:        { description: "Spec file or directory to analyze",          default: "." }
  fail-on:     { description: "Gate threshold: error|warning|info|never",   default: "error" }
  format:      { description: "Artefacto a producir: sarif|json|none",      default: "sarif" }
  cli:         { description: "Comando CLI a invocar",                      default: "npx -y @apigovscan/cli" }
  rules:       { description: "Rutas a reglas custom (space-separated)",    default: "" }
  config:      { description: "Ruta a apigovscan.yaml (opcional)",          default: "" }
  baseline:    { description: "Aplicar baseline (true|false)",              default: "false" }

outputs:
  sarif-path:  { description: "Ruta del artefacto SARIF (vacío si format=none)", value: ${{ steps.artifact.outputs.sarif-path }}
  exit-code:   { description: "Exit code del gate (0 ok, 1 findings, 2 error)",  value: ${{ steps.gate.outputs.exit-code }}

runs:
  using: composite
  steps: [ ... ]
```

### Pasos (3 corridas del CLI; env-based)

Todos los steps usan `env:` con `AG_CLI/AG_PATH/AG_FAIL_ON/AG_FORMAT/AG_RULES/AG_CONFIG/AG_BASELINE/AG_OUT` y los `run:` citan **solo** `$AG_*` + `$GITHUB_*` (AC-ACT.5).

| #   | id            | Comando (bash)                                                                                                                                                                                      | Propósito                                                                                                                                                              |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `artifact`    | `$AG_CLI analyze "$AG_PATH" --format sarif\|json --output apigovscan.sarif\|apigovscan.json --fail-on never` (+ `--rules/--config/--baseline` condicionales)                                        | Artefacto para upload; gate **nunca** acá ⇒ siempre se produce. Si `format: none`, step con `if:` en falso. Escribe `sarif-path=<archivo\|vacío>` en `$GITHUB_OUTPUT`. |
| 2   | `annotations` | `$AG_CLI analyze "$AG_PATH" --format annotations --fail-on never` (+ flags)                                                                                                                         | Workflow commands a stdout del step ⇒ GitHub publica anotaciones en el PR.                                                                                             |
| 3   | `gate`        | `$AG_CLI analyze "$AG_PATH" --format markdown --fail-on "$AG_FAIL_ON"` (+ flags) `>> "$GITHUB_STEP_SUMMARY"` con `set +e`, captura `$?` ⇒ `exit-code=$code` en `$GITHUB_OUTPUT`, luego `exit $code` | Resumen Markdown + **gate real** (exit 0/1/2 del CLI).                                                                                                                 |

- Flags condicionales (`--rules "$AG_RULES"`, `--config`, `--baseline`) solo se agregan si el input no está vacío/`false` (construidos con `$AG_*` en el run, sin `${{ }}`).
- `$AG_CLI` se expande **sin** comillas (admite `npx -y @apigovscan/cli`); paths siempre entre comillas.
- Archivos de salida en la raíz del workspace (`apigovscan.sarif`): mismo nombre entre corridas ⇒ el artefacto es único.
- `exit-code` es el exit code real del CLI (f1-analyze: 0 ok · 1 gate · 2 error).

### Uso (README / doc 05 §3 ajustado)

```yaml
jobs:
  apigovscan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: <owner>/<repo>/action@v1 # en este repo: ./action
        with:
          path: specs/
          fail-on: error
      - uses: github/codeql-action/upload-sarif@v3 # opcional
        if: always()
        with:
          sarif_file: ${{ steps.<id>.outputs.sarif-path }}
```

- **Sin codeql el gate funciona igual** (doc 05 §3): el job falla por exit code del paso `gate`.
- `if: always()` en el upload: el output `sarif-path` se escribe en el paso 1, antes del gate ⇒ disponible aunque el job falle.

### Dogfood

`.github/workflows/apigovscan.yml`:

```yaml
- uses: ./action
  with:
    path: fixtures/petstore-mini.yaml
    cli: node packages/cli/bin/apigovscan.js
    fail-on: never # o error si el fixture sale 0; verificar al implementar
```

- Corre en CI con el bin local (dogfood del mismo CLI; sin `npx` de red).
- Upload-sarif **no** se incluye en dogfood (evita permisos/`codeql` en CI propio).

## 4. Criterios de aceptación

- [x] **AC-ACT.1** `action/action.yml` parsea como YAML y declara: inputs `path/fail-on/format/cli/rules/config/baseline` (con defaults), outputs `sarif-path/exit-code`, `runs.using: composite` con ≥ 3 steps.
- [x] **AC-ACT.2** Simulación e2e (3 corridas del CLI con `GITHUB_STEP_SUMMARY`/`GITHUB_OUTPUT` apuntando a temp files): existe `apigovscan.sarif` con `version: "2.1.0"`, el summary contiene el Markdown (`# ApiGovScan report`), `$GITHUB_OUTPUT` tiene `exit-code=0`, y stdout del paso 2 contiene `::` commands cuando hay findings.
- [x] **AC-ACT.3** Con `fail-on: never` sobre `fixtures/petstore-mini.yaml` ⇒ `exit-code=0` y artefacto con ≥ 1 `results` (o vacío si el fixture no tiene findings — verificar; el assertion es "corrida OK + artefacto válido").
- [x] **AC-ACT.4** Gate real: fixture con findings ≥ `error` + `fail-on: error` ⇒ `exit-code=1` (el paso 3 "fallaría" en GH); con `fail-on: never` ⇒ 0.
- [x] **AC-ACT.5** Ningún bloque `run:` del `action.yml` contiene `${{` (interpolación solo en `env:`/`outputs:`) — test con parseo YAML + regex.
- [x] **AC-ACT.6** El action no ejecuta nada que no sea el CLI + builtins de shell: ningún `run:` define reglas, parsea YAML ni serializa (revisión estructural en test: `run:` solo referencia `$AG_CLI`/`$GITHUB_*`).
- [x] **AC-ACT.7** Workflow dogfood `.github/workflows/apigovscan.yml` usa `uses: ./action` y el job de CI verde incluye ese check.
- [x] **AC-ACT.8** `action/README.md` documenta inputs/outputs + snippet con upload SARIF opcional (`if: always()`).
- [x] **AC-ACT.9** `pnpm check` verde; INV-1 (el action corre el CLI local, cero red en el código del action), INV-3 intactos.

## 5. Test plan

| Caso                                           | Tipo                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `action.yml` parsea + inputs/outputs/composite | unit (`yaml` ya dep del cli)                                            |
| Sin `${{` en `run:` · solo CLI en `run:`       | unit (regex sobre bloques run)                                          |
| Simulación e2e 3 pasos con env fake            | e2e `packages/cli/test/action.e2e.test.ts` (spawn bin como lo haría GH) |
| Gate exit-code 0 vs 1 vs 2                     | e2e (fail-on never vs error vs path inválido)                           |
| Dogfood workflow                               | CI real (job nuevo en `ci.yml` o workflow propio)                       |

## 6. Dependencias

- Spec `f5-reporters` (`--format sarif|markdown|annotations` del CLI).
- `f1-analyze` (exit codes 0/1/2, `--output`, `--fail-on`).
- Dep `yaml` en `@apigovscan/cli` (ya presente) para parsear `action.yml` en tests.

## 7. Riesgos y decisiones abiertas

| Tema                                 | Decisión f5                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composite vs JS action               | **Composite**: invoca el CLI existente (doc 05: "mismo CLI, no lógica duplicada"); sin bundle ni esbuild ni `action/dist`.                                       |
| 3 corridas de CLI                    | Costo ≈ 3× analyze (specs son chicos); contraparte: artefacto+annotations existen **antes** del gate ⇒ upload funciona con `if: always()`. Documentado en §3.    |
| `standards-version` (doc 05)         | Diferido al registry (fase 6); snippet de doc 05 se ajusta al cierre de la fase.                                                                                 |
| Repo dedicado `apigovscan/action@v1` | No existe aún; spec cubre el action **in-repo** (`./action` o `<repo>/action@v1` sobre este repo). El UX target de doc 05 queda como roadmap, no se inventa URL. |
| Injection vía inputs `${{ }}` en run | Prohibido por diseño (AC-ACT.5); solo `env:`.                                                                                                                    |
| `npx` = red en CI                    | Esperado (instalación del CLI en el runner); el **código** del action no hace red (INV-1 aplica al binario, como en CLI/MCP). Dogfood usa `node bin` local.      |
| `fail-on: warning` vs baseline       | El gate usa el `--fail-on` del CLI tal cual; baseline/skills ya vienen por flags si el usuario los configura.                                                    |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 5 + FR-42 + doc 05 §3 + doc 06 §8.6 (estado `ready`).
- 2026-09-25 · M5.2: `action/action.yml` composite (3 pasos env-based), `action/README.md`, dogfood `.github/workflows/apigovscan.yml`, tests `action.e2e` (8) → `cerrada` (AC-ACT.1–9 verdes).
- 2026-09-26 · F6: input `license-key` → `APIGOVSCAN_LICENSE_KEY` en los 3 pasos (contrato en `f6-distribution` AC-D.9).
- 2026-09-30 · F14/M14.3: input `review-ref` + step `review-base` (git fetch/show del
  contrato base). En modo review, `artifact` emite `apigovscan-review.json` (review JSON)
  y `gate` corre `review --format console`; `annotations` se salta. El contrato del modo
  analyze queda intacto (AC-ACT.1–9 siguen vigentes; tests estructurales actualizados).
