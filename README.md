# ApiGovScan

> Analizador local de **API Governance** para equipos y proyectos existentes.
> Sin subir código ni specs a ningún lado, sin tokens de LLM en el camino: un motor determinista con estándares de élite, reglas propias al vuelo y una carpeta `skills/` que aprende de tu feedback.

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

**Fase 0 (fundación) implementada:** monorepo pnpm + TypeScript strict + ESLint/Prettier + Vitest + CI multi-OS + 5 packages esqueleto + fixtures. Spec `f0-foundation` en estado `implementada`.

```bash
pnpm install
pnpm check    # lint + typecheck + test + build + invariants

# Próximamente (fase 1 del roadmap):
npx @apigovscan/cli analyze ./openapi.yaml
```

## Roadmap (resumen)

Ver [docs/SDD.md §7](docs/SDD.md).

- **F0 (listo):** fundación del monorepo.
- **F1 (specs listos):** MVP `analyze` OpenAPI + pack elite ≥ 50 reglas.
- **F2+:** baseline, skills/learn, MCP, GitHub Action, Cloudflare, self-host.
