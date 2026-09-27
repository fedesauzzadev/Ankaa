# Plans · ApiGovScan

Planes de implementación derivados de los [specs](../specs/README.md). Un plan = **orden de construcción, hitos, riesgos y definición de hecho** para una fase o agrupación de specs.

| Plan | Cubre | Specs |
|---|---|---|
| [f0-foundation](f0-foundation.md) | Fundación del repo | f0-foundation |
| [f1-mvp](f1-mvp.md) | MVP analyze end-to-end | f1-* |
| [f2-governance](f2-governance.md) | Config + custom rules + baseline | f2-* |
| [f3-learning](f3-learning.md) | init + skills + learn | f3-* |
| [f4-mcp](f4-mcp.md) | MCP stdio local | f4-mcp-* |
| [f5-ci](f5-ci.md) | SARIF/Markdown/annotations + GitHub Action | f5-* |
| [f6-score](f6-score.md) | Governance score 0-100 + grade | f6-score |
| [f8-llm](f8-llm.md) | Feature LLM opcional: suggest_fix y siguientes | f8-* |
| [f8-rules-import](f8-rules-import.md) | Guideline interna → reglas (M8.2) | f8-rules-import |
| [f8-drift](f8-drift.md) | Drift spec↔código + generación (M8.3) | f8-drift |
| [f8-scan-org](f8-scan-org.md) | Informe consolidado multi-repo (M8.4) | f8-scan-org |
| [f8-elite-100](f8-elite-100.md) | Pack elite 88 reglas (M8.5 · cerrada) | f8-elite-100 |
| [f8-graphql](f8-graphql.md) | GraphQL SDL adapter + pack (M8.6) | f8-graphql |
| [f8-grpc](f8-grpc.md) | proto/gRPC parser + pack (M8.7) | f8-grpc |

## Convención

- **Milestone (M#):** slice vertical mergeable a `main` con CI verde.
- **Definition of Done (DoD)** de milestone: AC de specs cubiertos + invariants relevantes + docs actualizadas si cambió contrato.
- Los **tasks** checklist viven en [`../tasks`](../tasks/) y se marcan al ejecutar; el plan no se edita por micro-cambios (sí si cambia orden/alcance → changelog).

## Flujo de trabajo

```
spec ready → plan existe → tasks desglosados → implementar por milestone → cerrar spec (estado)
```
