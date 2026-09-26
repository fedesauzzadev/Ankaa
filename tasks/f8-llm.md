# Tasks · f8-llm

Plan: [plans/f8-llm.md](../plans/f8-llm.md) · Spec: [specs/f8-suggest-fix.md](../specs/f8-suggest-fix.md)

## M8.1 — suggest_fix

- [ ] `llm.ts` loadLlmConfig + chatCompletion + unit tests (AC-SF.1–2)
- [ ] Config strict `llm` + tests (AC-SF.2)
- [ ] Stub OpenAI-compatible reutilizable para tests (node:http, puerto efímero)
- [ ] CLI `fix` (diffs a stdout, nunca escribe) + e2e (AC-SF.4–6)
- [ ] Redacción del prompt/body al LLM asertada (AC-SF.7)
- [ ] MCP `suggest_fix` + registro + e2e (AC-SF.8)
- [ ] Boundary INV-1/INV-3: analyze/core sin `llm.ts` (AC-SF.3, SF.9)
- [ ] Help/README/changelog f2-config
- [ ] `pnpm check` verde
- [ ] Spec `f8-suggest-fix` → `cerrada` + índices
