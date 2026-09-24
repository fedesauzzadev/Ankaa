# ApiGovScan

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
# Reporte JSON a archivo
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --format json --output report.json

# Fallar el CI solo con errors (default)
node packages/cli/bin/apigovscan.js analyze ./openapi.yaml --fail-on error

# Explicar una regla del pack elite
node packages/cli/bin/apigovscan.js rules explain NAMING-001
```

Cuando el paquete esté publicado:

```bash
npx @apigovscan/cli analyze ./openapi.yaml
```

### Comandos (f1)

| Comando | Descripción |
|---|---|
| `apigovscan analyze <path>` | Analiza archivo, directorio o `-` (stdin) con el pack `elite` embebido |
| `apigovscan rules explain <ruleId>` | Muestra mensaje, fix, fuente y URL de una regla (`PREFIX-NNN`) |

Flags útiles de `analyze`: `--format console|json`, `--output <file>`, `--fail-on error|warning|info|never`, `--rules <file>`, `--rule <json>`, `--config <file>`, `--no-color`, `--debug`.

Exit codes: `0` ok · `1` findings ≥ `failOn` · `2` usage/parse/config error.

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

### Spec-driven development (Fase 0–1)

| Carpeta | Contenido |
|---|---|
| [specs/](specs/README.md) | Especificaciones con criterios de aceptación (`f0-*`, `f1-*`) |
| [plans/](plans/README.md) | Planes de implementación por milestone |
| [tasks/](tasks/README.md) | Checklists ejecutables |
| [AGENTS.md](AGENTS.md) | Convenciones para agentes y contribuidores |

## Estado

**Fase 0–1 (MVP) implementada:** monorepo pnpm + TypeScript strict + ESLint/Prettier + Vitest + CI multi-OS + parser OpenAPI 3.x + rules engine + pack **elite ≥ 50 reglas (65 activas)** + `analyze` e2e + reporters console/JSON + suite de invariantes INV-1…7. Specs `f0-foundation` y `f1-*` en estado `implementada`.

```bash
pnpm install
pnpm check    # lint + typecheck + test + build + invariants
```

## Roadmap (resumen)

Ver [docs/SDD.md §7](docs/SDD.md).

- **F0 (listo):** fundación del monorepo.
- **F1 (MVP):** `analyze` OpenAPI + pack elite ≥ 50 reglas + invariantes.
- **F2+:** baseline, skills/learn, MCP, GitHub Action, Cloudflare, self-host.
