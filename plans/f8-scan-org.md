# Plan · f8-scan-org · Informe consolidado multi-repo (M8.4)

| Campo | Valor |
|---|---|
| Specs | f8-scan-org |
| Dependencias | f8-rules-import cerrado (gates, strings); analyze/discovery/loaders existentes |

## M8.4 — Agregación + fetch GitHub + CLI

1. `packages/cli/src/scan.ts`: `aggregateScans` + `loadGroupMapping` puros + unit (AC-SO.1–3 parcial).
2. `packages/cli/src/github.ts`: `listOrgRepos` (fetch + Link next + `--max-repos`) + `cloneRepo` (git shallow vía child_process) — solo red/procesos acá.
3. CLI `scan-org` en `index.ts` (+ `parseScanOrgArgs` en `args.ts`): modos local/github, por-repo `loadConfig`+`prepareAnalysis`+`analyzeUseCase` en memoria (patrón fix), formatos, `--out`/`--force`, exit 0/2.
4. Tests: unit + e2e local (paridad vs analyze, formatos, gates, determinismo, INV-7) + e2e `--github` (stub 2 páginas + clones `file://` + 1 roto → skipped).
5. Boundary: extender `llm-boundary.test.ts` (fetch solo en `llm.ts`+`github.ts`; `scan.ts` puro).
6. Help/README (sección AI features? no — es batch determinista: línea en comandos/batch), índices. Sin cambios de contrato ajeno → sin changelogs cruzados.
7. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-SO.1–10 verdes; INV-1/2/7 verdes; `analyze` sin llm sigue byte-idéntico.

## Notas para el agente

- NO importar `analyze.ts` desde módulos nuevos salvo el use-case vía `index.ts` (boundary, ver `llm-boundary.test.ts`).
- Commits: mensaje sin comillas dobles embebidas (quirk PowerShell); usar `$msg = @'...'@` o string de una línea.

## Changelog del plan

- 2026-09-26 · Plan inicial (handoff).
- 2026-09-26 · M8.4 implementado → DoD cumplido (`pnpm check` verde: AC-SO.1–10, INV-1/2/7; sin cambios de contrato ajeno).
