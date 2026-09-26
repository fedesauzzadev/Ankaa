# ApiGovScan

[![CI](https://github.com/fedesauzzadev/ApiGovScan/actions/workflows/ci.yml/badge.svg)](https://github.com/fedesauzzadev/ApiGovScan/actions/workflows/ci.yml)
[![ApiGovScan dogfood](https://github.com/fedesauzzadev/ApiGovScan/actions/workflows/apigovscan.yml/badge.svg)](https://github.com/fedesauzzadev/ApiGovScan/actions/workflows/apigovscan.yml)

> Analizador local de **API Governance** para equipos y proyectos existentes.
> Sin subir código ni specs a ningún lado, sin tokens de LLM en el camino: un motor determinista con estándares de élite, reglas propias al vuelo y una carpeta `skills/` que aprende de tu feedback.

## Quickstart

```bash
# Desde el monorepo (después de pnpm install)
pnpm build
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml

# O con el bin local si ya está construido
node packages/cli/bin/apigovscan.js --help
```

Ejemplos:

```bash
# Governance score (0-100 + grade) en todos los formatos
# console: "! 0 errors · 6 warnings · 8 infos · score 74 (C) · reportHash 1a2b…"
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml

# Reporte JSON a archivo
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --format json --output report.json

# SARIF para code scanning + Markdown para job summaries
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --format sarif --output report.sarif
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --format markdown

# Anotaciones de GitHub Actions (::error / ::warning / ::notice)
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --format annotations

# Fallar el CI solo con errors (default)
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --fail-on error

# Explicar una regla del pack elite
node packages/cli/bin/apigovscan.js rules explain NAMING-001

# Validar reglas custom del equipo
node packages/cli/bin/apigovscan.js rules validate ./team-rules.yaml

# Analizar con reglas custom
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --rules ./team-rules.yaml
```

Cuando el paquete esté publicado:

```bash
npx @apigovscan/cli analyze ./openapi.yaml
```

### Comandos (f1–f4)

| Comando | Descripción |
|---|---|
| `apigovscan init [dir]` | Scaffold `apigovscan.yaml` + `.apigovscan/skills/` (no pisa contenido del usuario) |
| `apigovscan analyze <path>` | Analiza archivo, directorio o `-` (stdin) con el pack `elite` embebido |
| `apigovscan rules validate <file...>` | Valida reglas custom YAML/JSON contra el DSL (exit 0/2) |
| `apigovscan rules list [--rules <file>]` | Lista reglas del pack (y custom si se pasa `--rules`) |
| `apigovscan rules explain <ruleId> [--rules <file>]` | Muestra mensaje, fix, fuente y URL de una regla (`PREFIX-NNN`) |
| `apigovscan learn --report <r> --feedback <f>` | Aplica feedback a `.apigovscan/skills` (idempotente, INV-5) |
| `apigovscan skills list [--format json]` | Enumera suppressions, overrides y drafts |
| `apigovscan skills promote <draftId>` | Activa un draft (`draft: false`) |
| `apigovscan mcp [--help]` | Server MCP **stdio** local (tools FR-50, sandbox bajo cwd) |

#### MCP (Claude / Cursor / opencode)

```bash
apigovscan mcp
# o
npx @apigovscan/cli mcp
```

```json
{
  "mcpServers": {
    "apigovscan": {
      "command": "npx",
      "args": ["-y", "@apigovscan/cli", "mcp"]
    }
  }
}
```

Tools: `analyze_spec`, `list_rules`, `explain_rule`, `validate_custom_rules`, `explain_finding`.  
Paths rechazados si escapan del cwd; `analyze_spec` trunca findings (top 20) — el CLI da el reporte completo. Misma semántica que el CLI (FR-51); **0 red** (INV-1).

#### GitHub Action (f5)

Check de PR con anotaciones en el diff, job summary y artefacto SARIF — corre el **mismo CLI**
(`action/action.yml`, composite, sin lógica duplicada):

```yaml
- uses: ./action          # o <owner>/<repo>@v1 cuando esté publicado
  id: apigovscan
  with:
    path: specs/
    fail-on: error
- uses: github/codeql-action/upload-sarif@v3   # opcional
  if: always()
  with:
    sarif_file: ${{ steps.apigovscan.outputs.sarif-path }}
```

Inputs `path`, `fail-on`, `format` (`sarif|json|none`), `cli`, `rules`, `config`, `baseline` ·
Outputs `sarif-path`, `exit-code`. El gate funciona **sin code scanning** (exit 0/1/2 del CLI);
detalles en [`action/README.md`](action/README.md).

Flags útiles de `analyze`: `--format console|json|sarif|markdown|annotations`, `--output <file>`, `--fail-on error|warning|info|never`, `--rules <file>` (repetible), `--rule <json>`, `--config <file>`, `--write-baseline`, `--baseline`, `--baseline-path <file>`, `--force`, `--strict-hash`, `--baseline-ignore-hash`, `--skills-dir <dir>`, `--no-color`, `--debug`.

Exit codes: `0` ok · `1` findings ≥ `failOn` · `2` usage/parse/config/rule/baseline error.

### Baseline (gate "solo lo nuevo")

```bash
# Congela la deuda actual en .apigovscan/baseline.json
apigovscan analyze ./specs --write-baseline

# En CI: solo falla por findings no listados en el baseline
apigovscan analyze ./specs --baseline --fail-on error
```

- `--write-baseline` + `--force` pisa y deja `<path>.bak`.
- `--strict-hash` ⇒ inputHash mismatch es exit 2; default solo warning; `--baseline-ignore-hash` lo silencia.
- `summary.suppressed` entra en el reporte JSON; console muestra `(baseline: N suppressed)`.

### Skills (`.apigovscan/skills/`)

Análisis aplica suppressions (fingerprint o `match.ruleId`+`apiPath`) y overrides de severidad versionados en git:

```yaml
# .apigovscan/skills/suppressions.yaml
version: 1
suppressions:
  - fingerprint: "<64 hex>"
    reason: "Legacy endpoint frozen until v2"
  - match:
      ruleId: NAMING-001
      apiPath: "^/legacy/"
    reason: "Legacy namespace excluded"
```

```yaml
# .apigovscan/skills/severities.yaml
version: 1
overrides:
  - ruleId: PAGINATION-001
    severity: error
```

- Precedencia: config `rules:` > skills > pack default.
- Drafts en `skills/drafts/*.yaml` con `draft: true` **no** se evalúan hasta promover (`draft: false`).
- `summary.skillsSuppressed` solo si > 0; console `(skills: N suppressed)`.
- Dirección: `skillsDir` en config o flag `--skills-dir` (default `.apigovscan/skills`).

### Feedback → learn (INV-5)

```bash
apigovscan analyze ./openapi.yaml --format json --output report.json
# …editar feedback.json con items[] (false_positive | wontfix | severity_change | confirm | suggest_rule)
apigovscan learn --report report.json --feedback feedback.json
apigovscan skills list
apigovscan skills promote TEAM-001   # draft → activa
```

- `learn` es **idempotente**: dos corridas con el mismo input dejan los YAML byte-idénticos.
- `--dry-run` imprime el plan sin escribir (INV-7).

### Config `apigovscan.yaml`

Schema estricto (keys desconocidas → exit 2). Ejemplo completo en [`examples/apigovscan.yaml`](examples/apigovscan.yaml):

```yaml
failOn: error
standards:
  pack: elite
rules:
  NAMING-001: off
customRules:
  - ./team-rules.yaml   # relativas al directorio del config
  baseline:
  enabled: false
  path: .apigovscan/baseline.json
skillsDir: .apigovscan/skills   # suppressions/severities/drafts (f3)
```

Búsqueda: `--config <file>` → `./apigovscan.yaml` → `./apigovscan.yml`. Precedencia: flag CLI > config > default.

## Documentación

### SDD (Software Design Document)

| Doc | Contenido |
|---|---|
| [docs/SDD.md](docs/SDD.md) | Resumen ejecutivo, decisiones (D1–D12), invariantes, roadmap, riesgos, glosario |
| [docs/01-vision-y-requisitos.md](docs/01-vision-y-requisitos.md) | Visión, personas, alcance, FR/NFR |
| [docs/02-arquitectura.md](docs/02-arquitectura.md) | Clean Architecture, C4, ADRs |
| [docs/03-motor-y-reglas.md](docs/03-motor-y-reglas.md) | Motor, DSL, skills, aprendizaje, determinismo |
| [docs/04-estandares.md](docs/04-estandares.md) | Fuentes, versionado de packs, worker de actualización |
| [docs/05-despliegue-y-costos.md](docs/05-despliegue-y-costos.md) | CLI, Docker, Cloudflare, MCP, costos ($0) |
| [docs/06-seguridad.md](docs/06-seguridad.md) | Privacidad, hardening, supply chain, MCP |

### Spec-driven development (Fase 0–5)

| Carpeta | Contenido |
|---|---|
| [specs/](specs/README.md) | Especificaciones con criterios de aceptación (`f0-*` … `f5-*`) |
| [plans/](plans/README.md) | Planes de implementación por milestone |
| [tasks/](tasks/README.md) | Checklists ejecutables |
| [AGENTS.md](AGENTS.md) | Convenciones para agentes y contribuidores |

## Estado

**Fase 0–5 implementada + F6 en progreso:** monorepo pnpm + TypeScript strict + ESLint/Prettier + Vitest + CI multi-OS + parser OpenAPI 3.x + rules engine + pack **elite ≥ 50 reglas (65 activas)** + `analyze` e2e + reporters console/JSON + suite de invariantes INV-1…7 + config strict + custom rules + baseline + **skills load/apply (M3.1)** + **learn/skills CLI (M3.2)** + **init scaffold + S4 e2e (M3.3)** + **MCP stdio local con 5 tools FR-50 + sandbox + paridad CLI (F4)** + **reporters SARIF/Markdown/annotations + GitHub Action (F5)** + **governance score 0-100 + grade A–F (f6-score)**. Specs `f0-*`…`f5-*` en `cerrada`; `f6-score` cerrada (fase 6 sigue: distribución privada). Tags: `v0.1.0-mvp`, `v0.2.0-governance`, `v0.3.0-learning`, `v0.4.0-mcp`, `v0.5.0-action`.

```bash
pnpm install
pnpm check    # lint + typecheck + test + build + invariants
```

## Roadmap (resumen)

Ver [docs/SDD.md §7](docs/SDD.md).

- **F0 (listo):** fundación del monorepo.
- **F1 (MVP · tag `v0.1.0-mvp`):** `analyze` OpenAPI + pack elite ≥ 50 reglas + invariantes.
- **F2 (tag `v0.2.0-governance`):** config full ✅, custom rules ✅, baseline ✅ — specs `f2-*` en estado `cerrada`.
- **F3 (tag `v0.3.0-learning`):** skills, learn, init ✅ — specs `f3-*` en estado `cerrada`.
- **F4 (tag `v0.4.0-mcp`):** MCP stdio local ✅ — specs `f4-mcp-*` en estado `cerrada`.
- **F5 (tag `v0.5.0-action`):** reporters SARIF/Markdown/annotations ✅ + GitHub Action ✅ — specs `f5-*` en estado `cerrada`.
- **F6 (en progreso):** governance score ✅ (`f6-score`) · distribución privada para organizaciones (packs internos, licencia, self-host) pendiente.
- **F7+:** Cloudflare (registry de packs, MCP remoto), self-host completo.
