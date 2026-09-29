# Plan · f6-score · Governance score

| Campo        | Valor                         |
| ------------ | ----------------------------- |
| Specs        | f6-score                      |
| Dependencias | f1/f5 reporters implementados |

**Un milestone**: el score es un cambio de contrato chico pero transversal (build + 4 formatos + MCP + tests). Se implementa entero y se cierra.

## M6.1 — Score en Report + formatos + MCP (f6-score)

1. `packages/reporters/src/build.ts`: `ReportScore` + `score` requerido + fórmula + incluir en `hashPayload`/`computeReportHash`.
2. `console.ts` (footer) · `markdown.ts` (fila) · `sarif.ts` (`runs[0].properties`).
3. `packages/cli/src/mcp.ts`: `analyze_spec` payload con `score`.
4. Tests: `score.test.ts` (unit) + ajustes en formats/console e2e + paridad MCP.
5. Docs: `docs/01` FR-45 · `specs/f1-reporters` changelog (contrato Report) · README (ejemplo + estado).
6. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-S.1–8 verdes; INV-2 verde; docs al día.

## Changelog del plan

- 2026-09-26 · Plan inicial (re-priorización producto privado).
- 2026-09-26 · M6.1 implementado y verificado (AC-S.1–8, INV-2, `pnpm check` verde); spec `f6-score` cerrada. La fase 6 sigue abierta (distribución privada: license/packs/self-host).
