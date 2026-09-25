# Tasks · f5-ci

Plan: [plans/f5-ci.md](../plans/f5-ci.md) · Specs: `f5-reporters`, `f5-action`

---

## M5.1 — Formatters + CLI (f5-reporters)

- [x] `formatSarif(report, opts?)` en `packages/reporters/src/sarif.ts` (AC-SARIF.1–7)
- [x] `formatMarkdown(report)` en `markdown.ts` (AC-MD.1–3)
- [x] `formatAnnotations(report)` en `annotations.ts` (AC-ANN.1–3)
- [x] Exportar los 3 formatters en `packages/reporters/src/index.ts`
- [x] `OutputFormat` 5 valores + `ANALYZE_FORMATS` en `args.ts` (AC-CLI.1)
- [x] `RULES_FORMATS` (console|json) separado en `parseRulesArgs` (AC-CLI.3)
- [x] Dispatch de formatos en `createReportSink` (`loaders.ts`) — stdout silencioso con `--output` (AC-CLI.2)
- [x] Help de `analyze` documenta los 5 formatos (AC-CLI.4)
- [x] Tests unit reporters: SARIF, MD, annotations, redacción (AC-RED.1), determinismo (AC-INV.2)
- [x] Tests e2e CLI: formatos aceptados/inválidos, rules separado, `--output` sarif
- [x] Spec f5-reporters → `implementada`
- [x] `pnpm check` verde + commit M5.1

---

## M5.2 — Action + cierre fase 5 (f5-action)

- [x] `action/action.yml` composite: inputs/outputs/3 steps env-based (AC-ACT.1)
- [x] Test estructura: parseo YAML + sin `${{` en `run:` + solo CLI (AC-ACT.5–6)
- [x] E2E simulado con env fake `GITHUB_STEP_SUMMARY`/`GITHUB_OUTPUT` (AC-ACT.2–4)
- [x] `action/README.md` con snippet upload-sarif `if: always()` (AC-ACT.8)
- [x] Dogfood `.github/workflows/apigovscan.yml` con `uses: ./action` (AC-ACT.7)
- [x] README: formatos + sección GitHub Action + estado f0–f5 + roadmap
- [x] `docs/01` FR-40 (+`annotations`) · `docs/05` §3 snippet ajustado
- [x] `AGENTS.md` §3 (`action/`) · índices specs/plans/tasks
- [x] `pnpm check` verde (AC-ACT.9)
- [x] Specs f5-* → `cerrada` · DoD plans/f5-ci.md
- [x] Commits (docs-ready, feat M5.1, feat M5.2, docs-cierre)
- [x] Tag `v0.5.0-action`
