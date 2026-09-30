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

## Instalación

Dos ediciones, mismo motor (ver [versión community](#versión-community-open-source-apache-20) y [split OSS/pago](specs/f9-launch-oss.md)):

### Edición empresarial (privado)

Producto **privado con licencia comercial por cliente** (`packages/cli/LICENSE.md`). El análisis corre 100% on-prem; la licencia se valida **offline** (sin phone-home).

**Tarball self-contained (air-gap):**

```bash
npm install -g ./apigovscan-cli-<version>.tgz     # cero dependencies, pack elite embebido
APIGOVSCAN_LICENSE_KEY=AGS-<...> apigovscan analyze ./specs/
```

**Registry privado:** publicalo en GitHub Packages con el workflow `release` (manual) y el cliente hace `npm i -g @apigovscan/cli` con su token de org.

**Docker (air-gap):** `docker build -f docker/Dockerfile --build-arg TARBALL=apigovscan-cli-<version>.tgz .`

Licencia: `--license-key` · `APIGOVSCAN_LICENSE_KEY` · `license.key` en `apigovscan.yaml` (exigida por `analyze` y `mcp`; `apigovscan license` la valida). Detalles: [`docs/05 §3.1`](docs/05-despliegue-y-costos.md) y [`specs/f6-distribution.md`](specs/f6-distribution.md).

## Versión community (open source, Apache-2.0)

Por [fedesauzzadev](https://github.com/fedesauzzadev). El análisis corre 100% local; la licencia se valida **offline**, sin telemetría ni phone-home.

```bash
npm install -g ./apigovscan-cli-<version>.tgz
APIGOVSCAN_LICENSE_KEY=AGS-community-20300101-ba8a91370cc7 apigovscan analyze ./specs/
```

La key comunitaria es pública y verificable offline (no permite forjar otras keys). Incluye: analyze multi-protocolo, pack elite, custom rules a mano, baseline, skills/learn, score, reporters, Action, MCP local y features LLM trae-tu-key (`fix`, `drift`, `rules import`, `scan-org` local). La edición empresarial suma packs por cliente, registry self-host y soporte (ver [`specs/f7-enterprise.md`](specs/f7-enterprise.md)). Detalles del lanzamiento: [`specs/f9-launch-oss.md`](specs/f9-launch-oss.md).

### Comandos (f1–f4)

| Comando                                              | Descripción                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apigovscan init [dir]`                              | Scaffold `apigovscan.yaml` + `.apigovscan/skills/` (no pisa contenido del usuario)                                                                                                                                                                                                                                                                            |
| `apigovscan analyze <path>`                          | Analiza archivo, directorio o `-` (stdin): OpenAPI 3.x con el pack `elite`, Swagger 1.x/2.0 legacy (conversión best-effort + warning `SWAGGER_CONVERTED`), GraphQL SDL (`.graphql`/`.gql`) con el pack `graphql`, proto/gRPC (`.proto`) con el pack `grpc`, AsyncAPI v2/v3 (sniff) con el pack `asyncapi`, webhooks standalone (sniff) con el pack `webhooks` |
| `apigovscan rules validate <file...>`                | Valida reglas custom YAML/JSON contra el DSL (exit 0/2)                                                                                                                                                                                                                                                                                                       |
| `apigovscan rules list [--rules <file>]`             | Lista reglas del pack (y custom si se pasa `--rules`)                                                                                                                                                                                                                                                                                                         |
| `apigovscan rules explain <ruleId> [--rules <file>]` | Muestra mensaje, fix, fuente y URL de una regla (`PREFIX-NNN`)                                                                                                                                                                                                                                                                                                |
| `apigovscan learn --report <r> --feedback <f>`       | Aplica feedback a `.apigovscan/skills` (idempotente, INV-5)                                                                                                                                                                                                                                                                                                   |
| `apigovscan skills list [--format json]`             | Enumera suppressions, overrides y drafts                                                                                                                                                                                                                                                                                                                      |
| `apigovscan skills promote <draftId>`                | Activa un draft (`draft: false`)                                                                                                                                                                                                                                                                                                                              |
| `apigovscan license [--key <AGS-...>]`               | Valida la license key (customer + expiry)                                                                                                                                                                                                                                                                                                                     |
| `apigovscan fix <path> [--fingerprint <fp>]`         | Propone diffs unificados para findings con tu propio LLM (opcional; ver abajo)                                                                                                                                                                                                                                                                                |
| `apigovscan drift <dir> [--spec <file>]`             | Detecta drift spec↔código y genera borradores (ver abajo)                                                                                                                                                                                                                                                                                                     |
| `apigovscan dashboard <report.json> [--port <n>]`    | Visor local de tarjetas en `127.0.0.1` con agrupadores y tracking (ver abajo)                                                                                                                                                                                                                                                                                 |
| `apigovscan scan-org <dir> [--github <org>]`         | Informe consolidado multi-repo con scores por repo (ver abajo)                                                                                                                                                                                                                                                                                                |
| `apigovscan mcp [--help]`                            | Server MCP **stdio** local (tools FR-50 + `suggest_fix`, sandbox bajo cwd)                                                                                                                                                                                                                                                                                    |

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

Tools: `analyze_spec`, `list_rules`, `explain_rule`, `validate_custom_rules`, `explain_finding`, `suggest_fix`.  
Paths rechazados si escapan del cwd; `analyze_spec` trunca findings (top 20) — el CLI da el reporte completo. Misma semántica que el CLI (FR-51); **0 red** (INV-1).

#### AI features (optional, f8)

`fix` y la tool MCP `suggest_fix` proponen diffs unificados usando **tu propio LLM** (local o interno, API compatible OpenAI). Deterministas por diseño: el LLM solo redacta borradores; jamás analiza, puntúa ni cierra el gate (INV-1/INV-3).

```bash
# apigovscan.yaml
llm:
  baseUrl: http://localhost:11434/v1   # o tu servidor interno
  model: tu-modelo

apigovscan fix ./openapi.yaml                       # propuestas para todos los findings
apigovscan fix ./openapi.yaml --fingerprint <fp>    # solo uno

apigovscan rules import --from ./guideline.pdf       # draftea reglas custom desde tu guideline
apigovscan rules import --from ./guideline.md --out team.yaml --force

apigovscan drift ./mi-repo --spec ./openapi.yaml      # qué endpoints faltan/sobran/cambiaron
apigovscan drift ./mi-repo --out openapi.draft.yaml   # genera borrador si no hay spec
```

#### Batch audit (determinista, sin LLM)

`scan-org` corre `analyze` en cada subdirectorio y consolida scores por repo, agrupados por dominio y rankeados de peor a mejor. Solo red en el paso explícito de `--github`; el análisis siempre es local.

```bash
apigovscan scan-org ./org                           # un subdir = un proyecto
apigovscan scan-org ./org --group-by dominios.yaml  # repo: dominio
apigovscan scan-org ./clones --github acme --format json --out informe.json
apigovscan scan-org . --github acme --resume         # continúa/reutiliza solo revisiones verificadas
apigovscan scan-org . --github acme --from-scratch   # fuerza un nuevo análisis; conserva el historial
```

```yaml
# dominios.yaml
pagos-api: checkout
tienda-api: checkout
```

Variables: `GITHUB_TOKEN` (obligatoria con `--github`). `--resume` y `--from-scratch` son opciones excluyentes, requieren `--github`, y guardan historial local bajo `.apigovscan/workspace/`; no aceptan `--workdir`. Sin ellas, `scan-org` conserva su comportamiento anterior. Spec: [`specs/f8-scan-org.md`](specs/f8-scan-org.md) y [`specs/f15-local-workspace.md`](specs/f15-local-workspace.md).

#### Local dashboard (sin análisis, sin red más allá de loopback)

```bash
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --format json --output report.json
node packages/cli/bin/apigovscan.js dashboard report.json --against old.json --group-by dominios.yaml
# → dashboard at http://127.0.0.1:PORT (solo tu PC, Ctrl+C para parar)
```

Tarjetas por finding con filtros y agrupadores (pack, dueño, regla, archivo, severidad, tendencia, tracking). Los estados (pending → in progress → resolved) se guardan en `report.json.tracking.json`; el segundo análisis verifica por fingerprint. Spec: [`specs/f10-dashboard.md`](specs/f10-dashboard.md).

Variables equivalentes: `APIGOVSCAN_LLM_BASE_URL` / `_API_KEY` / `_MODEL` (ganan sobre la config). Los prompts se redactan (FR-43) y los diffs inválidos se rechazan con error honesto. Spec: [`specs/f8-suggest-fix.md`](specs/f8-suggest-fix.md).

#### GitHub Action (f5)

Check de PR con anotaciones en el diff, job summary y artefacto SARIF — corre el **mismo CLI**
(`action/action.yml`, composite, sin lógica duplicada):

```yaml
- uses: ./action # o <owner>/<repo>@v1 cuando esté publicado
  id: apigovscan
  with:
    path: specs/
    fail-on: error
- uses: github/codeql-action/upload-sarif@v3 # opcional
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
llm:                            # AI features opcionales (f8); sin esto todo sigue igual
  baseUrl: http://localhost:11434/v1
  model: tu-modelo
```

Búsqueda: `--config <file>` → `./apigovscan.yaml` → `./apigovscan.yml`. Precedencia: flag CLI > config > default.

## Documentación

### SDD (Software Design Document)

| Doc                                                              | Contenido                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [docs/SDD.md](docs/SDD.md)                                       | Resumen ejecutivo, decisiones (D1–D12), invariantes, roadmap, riesgos, glosario |
| [docs/01-vision-y-requisitos.md](docs/01-vision-y-requisitos.md) | Visión, personas, alcance, FR/NFR                                               |
| [docs/02-arquitectura.md](docs/02-arquitectura.md)               | Clean Architecture, C4, ADRs                                                    |
| [docs/03-motor-y-reglas.md](docs/03-motor-y-reglas.md)           | Motor, DSL, skills, aprendizaje, determinismo                                   |
| [docs/04-estandares.md](docs/04-estandares.md)                   | Fuentes, versionado de packs, worker de actualización                           |
| [docs/05-despliegue-y-costos.md](docs/05-despliegue-y-costos.md) | CLI, Docker, Cloudflare, MCP, costos ($0)                                       |
| [docs/06-seguridad.md](docs/06-seguridad.md)                     | Privacidad, hardening, supply chain, MCP                                        |

### Spec-driven development (Fase 0–5)

| Carpeta                   | Contenido                                                      |
| ------------------------- | -------------------------------------------------------------- |
| [specs/](specs/README.md) | Especificaciones con criterios de aceptación (`f0-*` … `f5-*`) |
| [plans/](plans/README.md) | Planes de implementación por milestone                         |
| [tasks/](tasks/README.md) | Checklists ejecutables                                         |
| [AGENTS.md](AGENTS.md)    | Convenciones para agentes y contribuidores                     |

## Estado

**Fase 0–6 cerrada + F8 cerrada + F9/F10:** monorepo pnpm + TypeScript strict + ESLint/Prettier + Vitest + CI multi-OS + parser OpenAPI 3.x + rules engine + pack **elite = 88 reglas activas** + `analyze` e2e + reporters console/JSON + suite de invariantes INV-1…7 + config strict + custom rules + baseline + **skills load/apply (M3.1)** + **learn/skills CLI (M3.2)** + **init scaffold + S4 e2e (M3.3)** + **MCP stdio local con 5 tools FR-50 + sandbox + paridad CLI (F4)** + **reporters SARIF/Markdown/annotations + GitHub Action (F5)** + **governance score 0-100 + grade A–F (f6-score)** + **licencia offline + distribución privada tarball/registry/Docker (f6-distribution)** + **LLM opcional + drift + scan-org + multi-protocolo GraphQL/gRPC/AsyncAPI/webhooks + legacy Swagger (F8)** + **visor local + papeles OSS (F9/F10)**. Tags: `v0.1.0-mvp` … `v0.5.0-action`, `v0.6.0-private`.

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
- **F6 (tag `v0.6.0-private`):** governance score ✅ (`f6-score`) · licencia offline + tarball/registry/Docker ✅ (`f6-distribution`) — fase cerrada.
- **F8 (cerrada):** LLM opcional ✅ (`f8-suggest-fix`, `f8-rules-import`, `f8-drift`) · batch multi-repo ✅ (`f8-scan-org`) · pack elite 88 ✅ (`f8-elite-100`) · multi-protocolo ✅ (`f8-graphql`, `f8-grpc`, `f8-asyncapi`, `f8-webhooks`) · legacy Swagger ✅ (`f8-legacy-convert`).
- **F9 (cerrada, sin publicar):** papeles OSS ✅ (`f9-launch-oss`: Apache-2.0 + community key + marca).
- **F10 (cerrada):** visor local ✅ (`f10-dashboard`, OSS).
- **F7 (backlog, `f7-enterprise` draft):** packs por cliente · self-host compose completo · edge Cloudflare (opcional) · export enterprise (`f10-export` como M7.4, `ready`, sin construir) — todo lo pendiente en una única fase; se abre cuando se arranque.
