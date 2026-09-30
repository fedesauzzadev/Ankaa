# Tasks · f8-fp-budget

Plan: [plans/f8-fp-budget.md](../plans/f8-fp-budget.md) · Spec: [specs/f8-fp-budget.md](../specs/f8-fp-budget.md)

## M17.1 — skills stats

- [x] `buildFpStats` pura en `packages/cli/src/fp-stats.ts` (dedup por fingerprint, precedencia feedback > tracking, conteos de silencio)
- [x] CLI `ankaa skills stats` (flags `--report/--feedback/--tracking/--min-sample/--fp-threshold/--format/--output`) + usage
- [x] Tests unit AC-FP.1…7 (agregación, muestra mínima, dedup, warnings, determinismo)
- [x] Tests e2e AC-FP.8/9 (exit codes, `--output` INV-7)
- [x] README sección Skills + índices (`plans/README.md`)
- [x] `pnpm check` verde
- [x] Spec `f8-fp-budget` → `implementada`
