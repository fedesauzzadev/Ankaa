# Plan · f8-drift · Drift spec↔código + generación (M8.3)

| Campo | Valor |
|---|---|
| Specs | f8-drift |
| Dependencias | f8-rules-import cerrado (stub, gates, strings); parser openapi |

## M8.3 — Detección + comparación + generación

1. `packages/cli/src/route-signatures.ts`: catálogo por familia + `detectRoutes`/`normalizeRoutePath` + unit true+false (AC-DR.1–2).
2. `packages/cli/src/drift.ts`: compare/generación/sweep-parse/shape-messages + unit (AC-DR.3 parcial, D.7 parcial).
3. Fixture `fixtures/drift-demo/`: mini-repo (Express, 4-5 rutas) + `openapi-stale.yaml` (1 faltante, 1 sobrante, 1 con método cambiado).
4. CLI `drift` en `index.ts`: gates (license; llm opcional), modos drift/generación, `--format`, `--out`/`--force`, exit codes (AC-DR.3–4, D.6–8).
5. Tests: unit + e2e con `llm-stub` (sweep, shape, redacción implícita) + determinismo + INV-7 (AC-DR.5–7, D.9–10).
6. Help/README (sección AI features: línea de `drift`), índices. Sin cambios de contrato ajeno → sin changelogs cruzados.
7. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-DR.1–10 verdes; INV-1/2/7 verdes; `analyze` sin llm sigue byte-idéntico.

## Notas para el agente

- NO importar `analyze.ts` desde drift/route-signatures (boundary, ver `llm-boundary.test.ts`).
- Commits: mensaje sin comillas dobles embebidas (quirk PowerShell); usar `$msg = @'...'@` o string de una línea.

## Changelog del plan

- 2026-09-26 · Plan inicial (handoff).
