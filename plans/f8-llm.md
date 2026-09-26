# Plan · f8-llm · Feature LLM opcional (suggest_fix primero)

| Campo | Valor |
|---|---|
| Specs | f8-suggest-fix (después: rules import, drift, scan-org — ver `f8-oss-differentials`) |
| Dependencias | f6 cerrado; motor/reportes/MCP implementados |

## M8.1 — Config LLM + adapter + `fix` CLI + MCP `suggest_fix`

1. `packages/cli/src/llm.ts`: `loadLlmConfig` (env > config) + `chatCompletion` (fetch nativo, timeout, errores EN). Nunca importado por analyze.
2. Config strict `llm: {baseUrl?, apiKey?, model?}` + tests (AC-SF.1–2).
3. CLI `fix <path> [--fingerprint]`: analyze in-memory → findings → prompt (regla + finding redactado + fragmento del spec redactado) → diff(s) propuestos a stdout. Sin escritura de archivos (AC-SF.4–6).
4. MCP tool `suggest_fix` en `packages/cli/src/mcp.ts` + registro en `packages/mcp/src/tools.ts` (AC-SF.8).
5. Stub OpenAI-compatible en tests (node:http, respuesta fija) + redacción asertada en el body (AC-SF.5–7).
6. Boundary INV: `analyze`/core sin importar `llm.ts` (AC-SF.3, SF.9).
7. Docs: help del CLI, README sección "AI features (optional)", changelog `f2-config`.
8. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-SF.1–9 verdes; INV-1..7 verdes; sin config `llm`, reportHash idéntico al de hoy.

## Changelog del plan

- 2026-09-26 · Plan inicial (handoff: leer AGENTS.md del repo antes de arrancar).
- 2026-09-26 · M8.1 implementado → DoD cumplido (`pnpm check` verde: lint + typecheck + tests + build + 16 invariants); refactor `prepareAnalysis` compartido analyze/fix sin cambios de comportamiento.
