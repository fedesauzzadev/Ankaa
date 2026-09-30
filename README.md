# Ankaa

[![CI](https://github.com/fedesauzzadev/Ankaa/actions/workflows/ci.yml/badge.svg)](https://github.com/fedesauzzadev/Ankaa/actions/workflows/ci.yml)
[![Ankaa dogfood](https://github.com/fedesauzzadev/Ankaa/actions/workflows/ankaa.yml/badge.svg)](https://github.com/fedesauzzadev/Ankaa/actions/workflows/ankaa.yml)

> Analizador local de **API Governance** para equipos y proyectos existentes.
> Sin subir código ni specs a ningún lado, sin tokens de LLM en el camino: un motor determinista con estándares de élite, reglas propias al vuelo y una carpeta `skills/` que aprende de tu feedback.

Requiere Node.js 22 o superior. El comando opcional `scan-repo` también requiere Git instalado.

## Quickstart

```bash
# Desde el monorepo (después de pnpm install)
pnpm build
node packages/cli/bin/ankaa.js analyze ./openapi.yaml

# O con el bin local si ya está construido
node packages/cli/bin/ankaa.js --help
```

Ejemplos:

```bash
# Governance score (0-100 + grade) en todos los formatos
# console: "! 0 errors · 6 warnings · 8 infos · score 74 (C) · reportHash 1a2b…"
node packages/cli/bin/ankaa.js analyze ./openapi.yaml

# Reporte JSON a archivo
node packages/cli/bin/ankaa.js analyze ./openapi.yaml --format json --output report.json

# SARIF para code scanning + Markdown para job summaries
node packages/cli/bin/ankaa.js analyze ./openapi.yaml --format sarif --output report.sarif
node packages/cli/bin/ankaa.js analyze ./openapi.yaml --format markdown

# Anotaciones de GitHub Actions (::error / ::warning / ::notice)
node packages/cli/bin/ankaa.js analyze ./openapi.yaml --format annotations

# Fallar el CI solo con errors (default)
node packages/cli/bin/ankaa.js analyze ./openapi.yaml --fail-on error

# Explicar una regla del pack elite
node packages/cli/bin/ankaa.js rules explain NAMING-001

# Validar reglas custom del equipo
node packages/cli/bin/ankaa.js rules validate ./team-rules.yaml

# Analizar con reglas custom
node packages/cli/bin/ankaa.js analyze ./openapi.yaml --rules ./team-rules.yaml
```

## Instalación

> **Migración desde el nombre anterior (Ankaa rename):** no hay alias legacy.
> Si venías usando `apigovscan`, mové tu carpeta local `mv .apigovscan .ankaa`
> (en Windows case-insensitive, con git: `git mv .apigovscan .ankaa`), renombrá
> `apigovscan.yaml` → `ankaa.yaml` y pasá tus env vars a `ANKAA_*`. Las keys
> `AGS-…` siguen válidas sin cambios; los baselines siguen funcionando porque
> comparan por fingerprints, que no cambiaron.

Dos ediciones, mismo motor (ver [versión community](#versión-community-open-source-apache-20) y [split OSS/pago](specs/f9-launch-oss.md)):

### Edición empresarial (privado)

Producto **privado con licencia comercial por cliente** (`packages/cli/LICENSE.md`). El análisis corre 100% on-prem; la licencia se valida **offline** (sin phone-home).

**Tarball self-contained (air-gap):**

```bash
npm install -g ./ankaa-cli-<version>.tgz     # cero dependencies, pack elite embebido
ANKAA_LICENSE_KEY=AGS-<...> ankaa analyze ./specs/
```

**Registry privado:** publicalo en GitHub Packages con el workflow `release` (manual) y el cliente hace `npm i -g @ankaa/cli` con su token de org.

**Docker (air-gap):** `docker build -f docker/Dockerfile --build-arg TARBALL=ankaa-cli-<version>.tgz .`

Licencia: `--license-key` · `ANKAA_LICENSE_KEY` · `license.key` en `ankaa.yaml` (exigida por `analyze` y `mcp`; `ankaa license` la valida). Detalles: [`docs/05 §3.1`](docs/05-despliegue-y-costos.md) y [`specs/f6-distribution.md`](specs/f6-distribution.md).

## Versión community (open source, Apache-2.0)

Por [fedesauzzadev](https://github.com/fedesauzzadev). El análisis corre 100% local; la licencia se valida **offline**, sin telemetría ni phone-home.

```bash
npm install -g ./ankaa-cli-<version>.tgz
ANKAA_LICENSE_KEY=AGS-community-20300101-ba8a91370cc7 ankaa analyze ./specs/
```

La key comunitaria es pública y verificable offline (no permite forjar otras keys). Incluye: analyze multi-protocolo, pack elite, custom rules a mano, baseline, skills/learn, score, reporters, Action, MCP local y features LLM trae-tu-key (`fix`, `drift`, `rules import`, `scan-org` local). La edición empresarial suma packs por cliente, registry self-host y soporte (ver [`specs/f7-enterprise.md`](specs/f7-enterprise.md)). Detalles del lanzamiento: [`specs/f9-launch-oss.md`](specs/f9-launch-oss.md).

### Comandos (f1–f4)

| Comando                                              | Descripción                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ankaa init [dir]`                              | Scaffold `ankaa.yaml` + `.ankaa/skills/` (no pisa contenido del usuario)                                                                                                                                                                                                                                                                            |
| `ankaa analyze <path>`                          | Analiza archivo, directorio o `-` (stdin): OpenAPI 3.x con el pack `elite`, Swagger 1.x/2.0 legacy (conversión best-effort + warning `SWAGGER_CONVERTED`), GraphQL SDL (`.graphql`/`.gql`) con el pack `graphql`, proto/gRPC (`.proto`) con el pack `grpc`, AsyncAPI v2/v3 (sniff) con el pack `asyncapi`, webhooks standalone (sniff) con el pack `webhooks` |
| `ankaa rules validate <file...>`                | Valida reglas custom YAML/JSON contra el DSL (exit 0/2)                                                                                                                                                                                                                                                                                                       |
| `ankaa rules list [--rules <file>]`             | Lista reglas del pack (y custom si se pasa `--rules`)                                                                                                                                                                                                                                                                                                         |
| `ankaa rules explain <ruleId> [--rules <file>]` | Muestra mensaje, fix, fuente y URL de una regla (`PREFIX-NNN`)                                                                                                                                                                                                                                                                                                |
| `ankaa learn --report <r> --feedback <f>`       | Aplica feedback a `.ankaa/skills` (idempotente, INV-5)                                                                                                                                                                                                                                                                                                   |
| `ankaa skills list [--format json]`             | Enumera suppressions, overrides y drafts                                                                                                                                                                                                                                                                                                                      |
| `ankaa skills stats --report <r> [--feedback <f>] [--tracking <t>]` | FP report local por regla desde feedback de learn + tracking del dashboard (informativo, no muta nada; spec `f8-fp-budget`)                                                                                                                              |
| `ankaa migrate --redocly-ignore\|--vacuum-ignore <file> --spec <path>` | Importa ignore-files ajenos como suppressions con fingerprint en `.ankaa/skills/migrated/` (spec `f17-migration-kit`)                                                                                                                                    |
| `ankaa skills promote <draftId>`                | Activa un draft (`draft: false`)                                                                                                                                                                                                                                                                                                                              |
| `ankaa license [--key <AGS-...>]`               | Valida la license key (customer + expiry)                                                                                                                                                                                                                                                                                                                     |
| `ankaa certify --report <r> --key <priv.pem>`   | Firma el reporte (ed25519 detached) y emite una atestación v1 (`--gen-keys` genera el par de claves)                                                                                                                                                                                                                                                          |
| `ankaa verify --report <r> --attestation <a.json> --key <pub.pem>` | Verifica que los bytes del reporte no cambiaron y la firma corresponde; exit 0/1/2; sin licencia (es el lado consumidor, p. ej. CI)                                                                                                                                                |
| `ankaa fix <path> [--fingerprint <fp>]`         | Propone diffs unificados para findings con tu propio LLM (opcional; ver abajo)                                                                                                                                                                                                                                                                                |
| `ankaa drift <dir> [--spec <file>]`             | Detecta drift spec↔código y genera borradores (ver abajo)                                                                                                                                                                                                                                                                                                     |
| `ankaa review <base> <candidate>`               | Combina governance del candidato y cambios incompatibles OpenAPI/Swagger en una revisión local JSON o legible                                                                                                                                                                                                                                                 |
| `ankaa dashboard <report.json> [--port <n>]`    | Visor local de tarjetas en `127.0.0.1` con agrupadores y tracking (ver abajo)                                                                                                                                                                                                                                                                            |
| `ankaa workspace [--port <n>]`                  | App web guiada local: corre operaciones tipadas (analyze) con progreso en vivo (ver abajo)                                                                                                                                                                                                                                                               |
| `ankaa guided`                                  | Asistente de terminal: menú, validaciones, confirmación y preparación de CI con preview (ver abajo)                                                                                                                                                                                                                                                     |
| `ankaa scan-org <dir> [--github <org>]`         | Informe consolidado multi-repo con scores por repo (ver abajo)                                                                                                                                                                                                                                                                                                |
| `ankaa scan-repo <git-url> [opciones]`          | Clona y analiza explícitamente un repo HTTPS/SSH con Git local                                                                                                                                                                                                                                                                                                |
| `ankaa export <report.json> [opciones]`         | JSON v1 de findings, grupos y tendencias para integraciones del cliente, sin red propia                                                                                                                                                                                                                                                                       |
| `ankaa mcp [--help]`                            | Server MCP **stdio** local (tools FR-50 + `suggest_fix`, sandbox bajo cwd)                                                                                                                                                                                                                                                                                    |

#### Revisar un cambio de contrato

```bash
ankaa review openapi-base.yaml openapi-candidate.yaml
ankaa review openapi-base.yaml openapi-candidate.yaml --format json --output review.json
```

`review` reúne reglas de governance del candidato y cambios incompatibles
respecto del contrato base en una sola salida. La comparación de cambios está
implementada para OpenAPI/Swagger; formatos no comparables producen un error
explícito, nunca una revisión limpia. No invoca un LLM. Ver
[`specs/f14-agent-api-gate.md`](specs/f14-agent-api-gate.md). Corpus de casos y
benchmark de consumo (tokens chars/4, sin LLM): [`fixtures/review-corpus/`](fixtures/review-corpus/README.md)
y [`docs/benchmarks/`](docs/benchmarks/review-benchmark-2026-09.md).

#### MCP (Claude / Cursor / opencode)

```bash
ankaa mcp
# o
npx @ankaa/cli mcp
```

```json
{
  "mcpServers": {
    "ankaa": {
      "command": "npx",
      "args": ["-y", "@ankaa/cli", "mcp"]
    }
  }
}
```

Tools: `analyze_spec`, `list_rules`, `explain_rule`, `validate_custom_rules`, `explain_finding`, `suggest_fix`, `review_api_change`.  
Paths rechazados si escapan del cwd; `analyze_spec` y `review_api_change` truncan findings (top 20, declaran `totalFindings`/`truncated`) — el CLI da el reporte completo. Misma semántica que el CLI (FR-51); **0 red** (INV-1). `review_api_change` corre la misma revisión que `ankaa review` sobre el estado actual de los archivos: es feedback para el agente, no un gate.

#### AI features (optional, f8)

`fix` y la tool MCP `suggest_fix` proponen diffs unificados usando **tu propio LLM** (local o interno, API compatible OpenAI). Deterministas por diseño: el LLM solo redacta borradores; jamás analiza, puntúa ni cierra el gate (INV-1/INV-3).

```bash
# ankaa.yaml
llm:
  baseUrl: http://localhost:11434/v1   # o tu servidor interno
  model: tu-modelo

ankaa fix ./openapi.yaml                       # propuestas para todos los findings
ankaa fix ./openapi.yaml --fingerprint <fp>    # solo uno

ankaa rules import --from ./guideline.pdf       # draftea reglas custom desde tu guideline
ankaa rules import --from ./guideline.md --out team.yaml --force

ankaa drift ./mi-repo --spec ./openapi.yaml      # qué endpoints faltan/sobran/cambiaron
ankaa drift ./mi-repo --out openapi.draft.yaml   # genera borrador si no hay spec
```

#### Batch audit (determinista, sin LLM)

`scan-org` corre `analyze` en cada subdirectorio y consolida scores por repo, agrupados por dominio y rankeados de peor a mejor. Solo red en el paso explícito de `--github`; el análisis siempre es local.

```bash
ankaa scan-org ./org                           # un subdir = un proyecto
ankaa scan-org ./org --group-by dominios.yaml  # repo: dominio
ankaa scan-org ./clones --github acme --format json --out informe.json
ankaa scan-org . --github acme --resume         # continúa/reutiliza solo revisiones verificadas
ankaa scan-org . --github acme --from-scratch   # fuerza un nuevo análisis; conserva el historial
```

```yaml
# dominios.yaml
pagos-api: checkout
tienda-api: checkout
```

Variables: `GITHUB_TOKEN` (obligatoria con `--github`). `--resume` y `--from-scratch` son opciones excluyentes, requieren `--github`, y guardan historial local bajo `.ankaa/workspace/`; no aceptan `--workdir`. Sin ellas, `scan-org` conserva su comportamiento anterior. Spec: [`specs/f8-scan-org.md`](specs/f8-scan-org.md) y [`specs/f15-local-workspace.md`](specs/f15-local-workspace.md).

#### Analizar un repositorio Git remoto

`scan-repo` clona shallow la rama por defecto y analiza el checkout con el mismo pipeline que `analyze`.
Acepta HTTPS sin credenciales embebidas y SSH usando el cliente, agente y configuración local de Git;
los prompts interactivos se desactivan. Sin `--workdir`, el checkout temporal se elimina al terminar.
No admite HTTP plano, tokens en la URL, submódulos ni selección de branch/tag.

```bash
ankaa scan-repo https://github.com/acme/payments-api.git --format json --out report.json
ankaa scan-repo git@github.com:acme/payments-api.git --workdir ./checkout
```

`--workdir` debe ser un directorio existente y vacío; conserva el clon en `repo/`.
`--out` escribe solo el archivo indicado y requiere `--force` si ya existe.
Config y licencia pueden pasarse con `--config` y `--license-key`. Spec: [`specs/f8-scan-repo.md`](specs/f8-scan-repo.md).

#### Exportar findings a integraciones

`export` genera un JSON versionado, agrupado por dueño/equipo y con tendencia por fingerprint. No realiza llamadas de red ni guarda credenciales; conectores de ejemplo viven en [`examples/integrations/`](examples/integrations/).

```bash
ankaa analyze ./openapi.yaml --format json --output report.json
ankaa export report.json --group-by owners.yaml --since previous-report.json --out integration.json
node examples/integrations/csv.mjs integration.json > findings.csv
```

El `owners.yaml` reutiliza el mapping del dashboard (`ruta-de-spec: equipo`). Ejemplos Jira y Slack usan variables de entorno para endpoint/credenciales y deben revisarse antes de conectarlos a un servicio real. Spec: [`specs/f10-export.md`](specs/f10-export.md).

#### Local dashboard (sin análisis, sin red más allá de loopback)

```bash
node packages/cli/bin/ankaa.js analyze ./openapi.yaml --format json --output report.json
node packages/cli/bin/ankaa.js dashboard report.json --against old.json --group-by dominios.yaml
# → dashboard at http://127.0.0.1:PORT (solo tu PC, Ctrl+C para parar)
```

#### Workspace guiado local (f15)

```bash
node packages/cli/bin/ankaa.js workspace
# → workspace at http://127.0.0.1:PORT (loopback + token por proceso, Ctrl+C para parar)
```

App web local para correr Ankaa sin flags: elegir un archivo/directorio,
ver progreso real por fase (`n de m`, sin porcentajes inventados), cancelar y
leer el resultado; el historial de ejecuciones queda persistido bajo
`.ankaa/workspace/runs/` con apertura de reportes y comparación de dos runs
compatibles por fingerprints. Todo inline (sin CDN), mutaciones protegidas por
token y validación Host/Origin, endpoints limitados a operaciones tipadas
(`specs/f15-local-workspace.md`).

#### Asistente de terminal (f15)

```bash
node packages/cli/bin/ankaa.js guided
```

Menú interactivo en la terminal: **elegir el origen** — archivo/directorio local,
URL de repo Git o organización GitHub (con la acción de red descrita y
consentida antes de clonar; análisis local en temporales que se borran) —,
analizar con validación y confirmación (mismo `reportHash` que la CLI), y
**preparar CI** — previsualiza el workflow completo (modo analyze o review con
`review-ref`) y escribe un solo archivo tras confirmación explícita; no
habilita branch protection ni toca settings de plataformas. Responder que no a
una confirmación no ejecuta ni escribe nada.

Tarjetas por finding con filtros y agrupadores (pack, dueño, regla, archivo, severidad, tendencia, tracking). Los estados (pending → in progress → resolved) se guardan en `report.json.tracking.json`; el segundo análisis verifica por fingerprint. **Copy suppress command** copia una orden de ejemplo; revisa y cambia `--decision`/`--reason` antes de ejecutarla. Luego vuelve a analizar para confirmar el cambio. Spec: [`specs/f10-dashboard.md`](specs/f10-dashboard.md).

Variables equivalentes: `ANKAA_LLM_BASE_URL` / `_API_KEY` / `_MODEL` (ganan sobre la config). Los prompts se redactan (FR-43) y los diffs inválidos se rechazan con error honesto. Spec: [`specs/f8-suggest-fix.md`](specs/f8-suggest-fix.md).

#### GitHub Action (f5)

Check de PR con anotaciones en el diff, job summary y artefacto SARIF — corre el **mismo CLI**
(`action/action.yml`, composite, sin lógica duplicada):

```yaml
- uses: ./action # o <owner>/<repo>@v1 cuando esté publicado
  id: ankaa
  with:
    path: specs/
    fail-on: error
- uses: github/codeql-action/upload-sarif@v3 # opcional
  if: always()
  with:
    sarif_file: ${{ steps.ankaa.outputs.sarif-path }}
```

Inputs `path`, `fail-on`, `format` (`sarif|json|none`), `cli`, `rules`, `config`, `baseline`, `review-ref` ·
Outputs `sarif-path`, `exit-code`. El gate funciona **sin code scanning** (exit 0/1/2 del CLI);
con `review-ref` (p. ej. `main`) la Action revisa el cambio completo del candidato contra el
contrato base — mismo evaluador que `review`/MCP (ver [action/README.md](action/README.md)).

Flags útiles de `analyze`: `--format console|json|sarif|markdown|annotations`, `--output <file>`, `--fail-on error|warning|info|never`, `--rules <file>` (repetible), `--rule <json>`, `--config <file>`, `--write-baseline`, `--baseline`, `--ratchet [--ratchet-severity error|warning]`, `--baseline-path <file>`, `--force`, `--strict-hash`, `--baseline-ignore-hash`, `--skills-dir <dir>`, `--no-color`, `--debug`.

Exit codes: `0` ok · `1` findings ≥ `failOn` · `2` usage/parse/config/rule/baseline error.

### Attestations firmadas (f8-certify)

Evidencia verificable de que un reporte (y su score/packs) no cambió después de
generado — pensado para CI que consume reportes de agentes o de personas:

```bash
# El consumidor genera el par y pinea la pública en el repo (una vez)
ankaa certify --gen-keys --private-out ankaa-priv.pem --public-out ankaa-pub.pem

# El productor firma (offline, ed25519 detached sobre los bytes crudos)
ankaa analyze ./openapi.yaml --format json --output report.json
ankaa certify --report report.json --key ankaa-priv.pem --out report.attestation.json

# El CI verifica (sin licencia): 0 válido · 1 manipulado/clave cruzada · 2 error operacional
ankaa verify --report report.json --attestation report.attestation.json --key ankaa-pub.pem
```

Atestaciones deterministas (mismos bytes + misma clave ⇒ atestación
byte-idéntica); firma sobre bytes crudos: si el archivo se reformatea, `verify`
falla — por diseño. Spec: [`specs/f8-certify.md`](specs/f8-certify.md).

### Baseline (gate "solo lo nuevo")

```bash
# Congela la deuda actual en .ankaa/baseline.json
ankaa analyze ./specs --write-baseline

# En CI: solo falla por findings no listados en el baseline
ankaa analyze ./specs --baseline --fail-on error
```

- `--write-baseline` + `--force` pisa y deja `<path>.bak`.
- `--strict-hash` ⇒ inputHash mismatch es exit 2; default solo warning; `--baseline-ignore-hash` lo silencia.
- `summary.suppressed` entra en el reporte JSON; console muestra `(baseline: N suppressed)`.

### Ratchet: la deuda no puede crecer (f17-ratchet)

```bash
ankaa analyze ./specs --baseline --ratchet                     # gate error (default)
ankaa analyze ./specs --baseline --ratchet --ratchet-severity warning
```

Falla (exit 1) si la deuda neta crece: `netDelta = new − resolved`, con `new`
= findings visibles post-baseline al nivel del gate y `resolved` =
fingerprints del baseline que ya no aparecen. El reporte JSON lleva
`summary.ratchet { newCount, resolvedCount, netDelta }` y console/markdown
muestran `(ratchet: +N new · M resolved · net +X)`. Matriz de gates: exit
final es el más severo entre `--fail-on` (findings visibles) y ratchet (deuda
neta); ambos se evalúan post-supresiones. Spec:
[`specs/f17-ratchet.md`](specs/f17-ratchet.md).

### Skills (`.ankaa/skills/`)

Análisis aplica suppressions (fingerprint o `match.ruleId`+`apiPath`) y overrides de severidad versionados en git:

```yaml
# .ankaa/skills/suppressions.yaml
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
# .ankaa/skills/severities.yaml
version: 1
overrides:
  - ruleId: PAGINATION-001
    severity: error
```

- Precedencia: config `rules:` > skills > pack default.
- Drafts en `skills/drafts/*.yaml` con `draft: true` **no** se evalúan hasta promover (`draft: false`).
- `summary.skillsSuppressed` solo si > 0; console `(skills: N suppressed)`.
- Dirección: `skillsDir` en config o flag `--skills-dir` (default `.ankaa/skills`).

### Feedback → learn (INV-5)

```bash
ankaa analyze ./openapi.yaml --format json --output report.json
# …editar feedback.json con items[] (false_positive | wontfix | severity_change | confirm | suggest_rule)
ankaa learn --report report.json --feedback feedback.json
ankaa skills list
ankaa skills promote TEAM-001   # draft → activa
```

- `learn` es **idempotente**: dos corridas con el mismo input dejan los YAML byte-idénticos.
- `--dry-run` imprime el plan sin escribir (INV-7).

Medí el ruido de tus reglas con ese feedback (sin telemetría, sin mutar nada):

```bash
ankaa skills stats --report report.json --feedback feedback.json --tracking report.json.tracking.json
# FP rate por regla; sample >= 10 y rate > 30% (flags --min-sample/--fp-threshold) marca la regla `noisy`
```

### Migración desde Redocly / vacuum (f17-migration-kit)

Trae tus excepciones acumuladas sin empezar de cero — las suppressions
resultantes son por **fingerprint** (sobreviven refactors) y viven en
`.ankaa/skills/migrated/`, versionadas en git:

```bash
ankaa migrate --redocly-ignore .redocly.lint-ignore.yaml --spec openapi.yaml
ankaa migrate --vacuum-ignore ignore.yaml --spec openapi.yaml --dry-run
```

Matching por location: el ruleId de origen queda registrado en el `reason`,
nunca se interpreta; entradas sin match se listan con motivo. Idempotente y
100% offline. Spec: [`specs/f17-migration-kit.md`](specs/f17-migration-kit.md).

### Config `ankaa.yaml`

Schema estricto (keys desconocidas → exit 2). Ejemplo completo en [`examples/ankaa.yaml`](examples/ankaa.yaml):

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
  path: .ankaa/baseline.json
skillsDir: .ankaa/skills   # suppressions/severities/drafts (f3)
llm:                            # AI features opcionales (f8); sin esto todo sigue igual
  baseUrl: http://localhost:11434/v1
  model: tu-modelo
```

Búsqueda: `--config <file>` → `./ankaa.yaml` → `./ankaa.yml`. Precedencia: flag CLI > config > default.

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

**Fase 0–6 cerrada + F8 cerrada + F9/F10:** monorepo pnpm + TypeScript strict + ESLint/Prettier + Vitest + CI multi-OS + parser OpenAPI 3.x + rules engine + pack **elite = 95 reglas activas** + `analyze` e2e + reporters console/JSON + suite de invariantes INV-1…7 + config strict + custom rules + baseline + **skills load/apply (M3.1)** + **learn/skills CLI (M3.2)** + **init scaffold + S4 e2e (M3.3)** + **MCP stdio local con 5 tools FR-50 + sandbox + paridad CLI (F4)** + **reporters SARIF/Markdown/annotations + GitHub Action (F5)** + **governance score 0-100 + grade A–F (f6-score)** + **licencia offline + distribución privada tarball/registry/Docker (f6-distribution)** + **LLM opcional + drift + scan-org + multi-protocolo GraphQL/gRPC/AsyncAPI/webhooks + legacy Swagger (F8)** + **visor local + papeles OSS (F9/F10)**. Tags: `v0.1.0-mvp` … `v0.5.0-action`, `v0.6.0-private`.

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
- **F8 (cerrada):** LLM opcional ✅ (`f8-suggest-fix`, `f8-rules-import`, `f8-drift`) · batch multi-repo ✅ (`f8-scan-org`) · pack elite 95 ✅ (`f8-elite-100`) · multi-protocolo ✅ (`f8-graphql`, `f8-grpc`, `f8-asyncapi`, `f8-webhooks`) · legacy Swagger ✅ (`f8-legacy-convert`).
- **F9 (cerrada, sin publicar):** papeles OSS ✅ (`f9-launch-oss`: Apache-2.0 + community key + marca).
- **F10 (cerrada):** visor local ✅ (`f10-dashboard`, OSS).
- **F7 (backlog, `f7-enterprise` draft):** packs por cliente · self-host compose completo · edge Cloudflare (opcional) · export enterprise (`f10-export` como M7.4) — export JSON v1 implementado; el gate por tier espera la definición de F7.
- **F14 (cerrada):** revisor local de cambios API para personas y agentes (`specs/f14-agent-api-gate.md`): `review` CLI + evaluador compartido, tool MCP `review_api_change`, Action con `review-ref`, corpus + benchmark con resultados medidos.
- **F15 (cerrada):** workspace local guiado (`specs/f15-local-workspace.md`): scan-org reanudable (M15.1), operación tipada `analyze` con progreso/cancelación (M15.2), app web `workspace` en loopback con token y endpoints tipados (M15.3), historial de runs + comparación por fingerprints (M15.4), asistente `guided` con orígenes local/repo/org y preparación de CI con preview (M15.5), cierre a11y/multi-OS (M15.6).
