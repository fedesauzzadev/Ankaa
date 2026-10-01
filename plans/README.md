# Plans · ApiGovScan

Planes de implementación derivados de los [specs](../specs/README.md). Un plan = **orden de construcción, hitos, riesgos y definición de hecho** para una fase o agrupación de specs.

| Plan                                          | Cubre                                                           | Specs               |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------- |
| [f0-foundation](f0-foundation.md)             | Fundación del repo                                              | f0-foundation       |
| [f1-mvp](f1-mvp.md)                           | MVP analyze end-to-end                                          | f1-*                |
| [f2-governance](f2-governance.md)             | Config + custom rules + baseline                                | f2-*                |
| [f3-learning](f3-learning.md)                 | init + skills + learn                                           | f3-*                |
| [f4-mcp](f4-mcp.md)                           | MCP stdio local                                                 | f4-mcp-*            |
| [f5-ci](f5-ci.md)                             | SARIF/Markdown/annotations + GitHub Action                      | f5-*                |
| [f6-score](f6-score.md)                       | Governance score 0-100 + grade                                  | f6-score            |
| [f8-llm](f8-llm.md)                           | Feature LLM opcional: suggest_fix y siguientes                  | f8-*                |
| [f8-rules-import](f8-rules-import.md)         | Guideline interna → reglas (M8.2)                               | f8-rules-import     |
| [f8-drift](f8-drift.md)                       | Drift spec↔código + generación (M8.3)                           | f8-drift            |
| [f8-scan-org](f8-scan-org.md)                 | Informe consolidado multi-repo (M8.4)                           | f8-scan-org         |
| [f8-scan-repo](f8-scan-repo.md)               | Analizar un repo Git individual (M8.11)                         | f8-scan-repo        |
| [f8-elite-100](f8-elite-100.md)               | Pack elite 88 reglas (M8.5 · cerrada)                           | f8-elite-100        |
| [f8-graphql](f8-graphql.md)                   | GraphQL SDL adapter + pack (M8.6)                               | f8-graphql          |
| [f8-grpc](f8-grpc.md)                         | proto/gRPC parser + pack (M8.7)                                 | f8-grpc             |
| [f8-asyncapi](f8-asyncapi.md)                 | AsyncAPI v2+v3 parser + pack (M8.8)                             | f8-asyncapi         |
| [f8-webhooks](f8-webhooks.md)                 | Webhooks parser + pack (M8.9)                                   | f8-webhooks         |
| [f8-legacy-convert](f8-legacy-convert.md)     | Legacy Swagger 1.x/2.0 → Spec (M8.10)                           | f8-legacy-convert   |
| [f9-launch-oss](f9-launch-oss.md)             | Papeles lanzamiento OSS, sin publicar (M9.1)                    | f9-launch-oss       |
| [f10-dashboard](f10-dashboard.md)             | Visor local + tracking OSS (M10.1)                              | f10-dashboard       |
| [f10-export](f10-export.md)                   | Export enterprise sin red propia (M7.4, F7)                     | f10-export          |
| [f14-agent-api-gate](f14-agent-api-gate.md)   | Revisor local de cambios API para personas/agentes (M14)        | f14-agent-api-gate  |
| [f15-local-workspace](f15-local-workspace.md) | Workspace local guiado, historial y `scan-org` reanudable (M15) | f15-local-workspace |
| [f8-fp-budget](f8-fp-budget.md)               | FP report por regla desde feedback local (M17.1, backlog f17)   | f8-fp-budget        |
| [f8-certify](f8-certify.md)                   | Attestations ed25519 certify/verify (M17.2, backlog f17)        | f8-certify          |
| [f17-migration-kit](f17-migration-kit.md)     | Migrar excepciones redocly/vacuum → skills/migrated (M17.3)     | f17-migration-kit   |
| [f17-ratchet](f17-ratchet.md)                 | Gate de deuda no creciente --ratchet (M17.4, backlog f17)       | f17-ratchet         |
| [f17-compliance-pack](f17-compliance-pack.md) | PRIV-001 + mappings + export --controls (M17.5, backlog f17)    | f17-compliance-pack |
| [f13-mini-validator](f13-mini-validator.md)   | validate-examples: ejemplos vs schemas offline (M17.6, backlog f17) | f13-mini-validator |
| [f17-ci-reporters](f17-ci-reporters.md)       | junit/checkstyle/codequality + recetas CI (M17.7a, backlog f17) | f17-ci-reporters |
| [f17-lsp](f17-lsp.md)                         | ankaa lsp + posiciones YAML M17.7b (M17.8, backlog f17)         | f17-lsp |
| [f17-diferenciales](f17-diferenciales.md)     | Backlog T1–T3 de diferenciales competitivos (specs en draft)    | f17-* + drafts f8/f13 |

## Convención

- **Milestone (M#):** slice vertical mergeable a `main` con CI verde.
- **Definition of Done (DoD)** de milestone: AC de specs cubiertos + invariants relevantes + docs actualizadas si cambió contrato.
- Los **tasks** checklist viven en [`../tasks`](../tasks/) y se marcan al ejecutar; el plan no se edita por micro-cambios (sí si cambia orden/alcance → changelog).

## Flujo de trabajo

```
spec ready → plan existe → tasks desglosados → implementar por milestone → cerrar spec (estado)
```
