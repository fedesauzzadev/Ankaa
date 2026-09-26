# Tasks · f8-drift

Plan: [plans/f8-drift.md](../plans/f8-drift.md) · Spec: [specs/f8-drift.md](../specs/f8-drift.md)

## M8.3 — drift + generación

- [x] `route-signatures.ts` + unit true+false por familia + normalización (AC-DR.1–2)
- [x] `drift.ts` compare/generación/parsers + unit (AC-DR.3 parcial, D.7 parcial)
- [x] Fixture `fixtures/drift-demo/` (mini-repo Express + `openapi-stale.yaml`)
- [x] CLI `drift` (modos, gates, --format, --out/--force, exit codes) (AC-DR.3–4, D.6–8)
- [x] E2E sweep/shape con llm-stub + determinismo + INV-7 (AC-DR.5–7, D.9–10)
- [x] Boundary (sin analyze.ts, sin LLM en core) (AC-DR.9)
- [x] Help/README/índices
- [x] `pnpm check` verde
- [x] Spec `f8-drift` → `cerrada` + índices
