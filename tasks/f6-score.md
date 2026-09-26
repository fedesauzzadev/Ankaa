# Tasks · f6-score

Plan: [plans/f6-score.md](../plans/f6-score.md) · Spec: [specs/f6-score.md](../specs/f6-score.md)

## M6.1 — Score en Report + formatos + MCP

- [ ] `build.ts`: `ReportScore`, campo `score`, fórmula 8/3/1, grades, hash (AC-S.1–3, S.8)
- [ ] `console.ts`: footer `· score N (G)` (AC-S.4)
- [ ] `markdown.ts`: fila `| Score | N/100 (G) |` (AC-S.5)
- [ ] `sarif.ts`: `runs[0].properties` score/grade (AC-S.6)
- [ ] `mcp.ts`: `analyze_spec` payload `score` (AC-S.7)
- [ ] Tests unit `score.test.ts` + formats + e2e cli/mcp paridad
- [ ] `docs/01` FR-45 · changelog `f1-reporters` · README ejemplo
- [ ] `pnpm check` verde
- [ ] Spec `f6-score` → `cerrada` + índices
