# Tasks · f5-ci

Plan: [plans/f5-ci.md](../plans/f5-ci.md) · Specs: `f5-reporters`, `f5-action`

---

## M5.1 — Formatters + CLI (f5-reporters)

- [ ] `formatSarif(report, opts?)` en `packages/reporters/src/sarif.ts` (AC-SARIF.1–7)
- [ ] `formatMarkdown(report)` en `markdown.ts` (AC-MD.1–3)
- [ ] `formatAnnotations(report)` en `annotations.ts` (AC-ANN.1–3)
- [ ] Exportar los 3 formatters en `packages/reporters/src/index.ts`
- [ ] `OutputFormat` 5 valores + `ANALYZE_FORMATS` en `args.ts` (AC-CLI.1)
- [ ] `RULES_FORMATS` (console|json) separado en `parseRulesArgs` (AC-CLI.3)
- [ ] Dispatch de formatos en `createReportSink` (`loaders.ts`) — stdout silencioso con `--output` (AC-CLI.2)
- [ ] Help de `analyze` documenta los 5 formatos (AC-CLI.4)
- [ ] Tests unit reporters: SARIF, MD, annotations, redacción (AC-RED.1), determinismo (AC-INV.2)
- [ ] Tests e2e CLI: formatos aceptados/inválidos, rules separado, `--output` sarif
- [ ] Spec f5-reporters → `implementada`
- [ ] `pnpm check` verde + commit M5.1

---

## M5.2 — Action + cierre fase 5 (f5-action)

- [ ] `action/action.yml` composite: inputs/outputs/3 steps env-based (AC-ACT.1)
- [ ] Test estructura: parseo YAML + sin `${{` en `run:` + solo CLI (AC-ACT.5–6)
- [ ] E2E simulado con env fake `GITHUB_STEP_SUMMARY`/`GITHUB_OUTPUT` (AC-ACT.2–4)
- [ ] `action/README.md` con snippet upload-sarif `if: always()` (AC-ACT.8)
- [ ] Dogfood `.github/workflows/apigovscan.yml` con `uses: ./action` (AC-ACT.7)
- [ ] README: formatos + sección GitHub Action + estado f0–f5 + roadmap
- [ ] `docs/01` FR-40 (+`annotations`) · `docs/05` §3 snippet ajustado
- [ ] `AGENTS.md` §3 (`action/`) · índices specs/plans/tasks
- [ ] `pnpm check` verde (AC-ACT.9)
- [ ] Specs f5-* → `cerrada` · DoD plans/f5-ci.md
- [ ] Commits (docs-ready, feat M5.1, feat M5.2, docs-cierre)
- [ ] Tag `v0.5.0-action`
