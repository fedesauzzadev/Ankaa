# Plan · f5-ci · Reporters SARIF/Markdown + GitHub Action

| Campo | Valor |
|---|---|
| Specs | f5-reporters, f5-action |
| Esfuerzo estimado | 1 semana (1 dev full-time equivalente) |
| Dependencias | f4 cerrado (`v0.4.0-mcp`) |
| Milestones | M5.1–M5.2 |

## Estrategia

**Primero los formatters y su wiring en CLI** (base del action), **después el action + dogfood + cierre**. El action es delgada: si los formatos y exit codes ya están, M5.2 es YAML + tests de estructura + e2e simulado.

```
M5.1 formatSarif + formatMarkdown + formatAnnotations + --format CLI (f5-reporters)
M5.2 action.yml + README + dogfood workflow + e2e action + docs + cierre (f5-action)
```

## M5.1 — Formatters + CLI (f5-reporters)

**Alcance:** tres funciones en `@apigovscan/reporters`, `OutputFormat` extendido, sink, help, tests.

Pasos:

1. `packages/reporters/src/sarif.ts`: `formatSarif(report, opts?)` — schema/level/uri/dedupe/fingerprints según spec §3 (sin region, sin timestamps, `help.uri` solo si `source.url`).
2. `packages/reporters/src/markdown.ts`: `formatMarkdown(report)` — tabla de conteos + findings por severidad + `reportHash`, escape `|`/`\n`.
3. `packages/reporters/src/annotations.ts`: `formatAnnotations(report)` — `::error/::warning/::notice`, escaping mensaje/propiedades, salida vacía sin findings.
4. Exportar los 3 en `packages/reporters/src/index.ts`.
5. CLI: `OutputFormat` + `ANALYZE_FORMATS` (5) en `args.ts`; `RULES_FORMATS` (console|json) en `parseRulesArgs`; mensajes de error actualizados; dispatch en `createReportSink` (loaders.ts); help en `index.ts`.
6. Tests: unit en `packages/reporters/test/` (SARIF/MD/annotations + redacción + determinismo) y e2e CLI en `packages/cli/test/analyze.e2e.test.ts` (acepta/formatos inválidos/rules separado/`--output` silencioso).
7. Spec `f5-reporters` → `implementada`.

**DoD:** AC-SARIF.1–7, AC-MD.1–3, AC-ANN.1–3, AC-CLI.1–4, AC-RED.1, AC-INV.2 verdes; `pnpm check` verde; commit.

## M5.2 — Action + cierre fase 5 (f5-action)

**Alcance:** `action/action.yml`, e2e simulado, dogfood, docs, tag.

Pasos:

1. `action/action.yml`: inputs/outputs/3 steps env-based según spec §3 (artifact → annotations → gate+summary).
2. `packages/cli/test/action.e2e.test.ts`: parseo YAML (inputs/outputs/composite + sin `${{` en `run:` + solo `$AG_CLI`), y simulación e2e con `GITHUB_STEP_SUMMARY`/`GITHUB_OUTPUT`/`GITHUB_WORKSPACE` fake sobre `fixtures/petstore-mini.yaml` (gate `never` ⇒ 0; gate `error` ⇒ 1 si hay error).
3. `action/README.md` con inputs/outputs + snippet upload-sarif `if: always()`.
4. `.github/workflows/apigovscan.yml` (dogfood: `uses: ./action`, `cli: node packages/cli/bin/apigovscan.js`, `fail-on` según verificación del fixture).
5. Docs: README (formatos, sección GitHub Action, estado f0–f5, roadmap F5 ✅), `docs/01` FR-40 (+`annotations`) y FR-42, `docs/05` §3 snippet ajustado (sin `standards-version`, in-repo `./action`), `AGENTS.md` §3 (`action/`), índices specs/plans/tasks.
6. `pnpm check` verde → commits (docs-ready, feat M5.1, feat M5.2, docs-cierre) → specs `f5-*` → `cerrada` → tag **`v0.5.0-action`**.

**DoD:** todos AC de f5-reporters + f5-action; criterio salida SDD fase 5 (PR check publica annotations + job summary — demostrado por e2e simulado + dogfood en CI); tag.

## Orden de merge recomendado

1. `feat/f5-reporters` (M5.1)
2. `feat/f5-action-close` (M5.2)

## Riesgos del plan

| Riesgo | Impacto | Mitigación |
|---|---|---|
| SARIF rechazado por code scanning (schema estricto) | UX CI | Cumplir §3 mínimo (driver/rules/results/level); upload es opcional del usuario |
| `${{ }}` injection en `run:` | Seguridad | Solo `env:` + test regex AC-ACT.5 |
| 3 corridas CLI lentas | CI time | Specs chicos; si duele, fusionar 1+3 en el futuro (changelog) |
| Fixture gate ≠ 0 rompe dogfood | CI rojo | `fail-on: never` en dogfood si hace falta; verificar al implementar (AC-ACT.3/7) |
| Action sin lógica → tentación de "mejorar" en YAML | INV-3 | AC-ACT.6 revisa que `run:` solo invoque al CLI |
| `annotations` fuera de FR-40 | Contradice doc | Ampliar FR-40 en `docs/01` + changelog del spec al cierre |

## Definition of Done (fase 5 completa)

- [ ] Specs `f5-reporters` y `f5-action` en estado `cerrada`
- [ ] `pnpm check` verde
- [ ] AC-SARIF/MD/ANN/CLI/RED/INV de f5-reporters verdes
- [ ] AC-ACT.1–9 de f5-action verdes
- [ ] Criterio SDD: PR check publica annotations + job summary (dogfood CI + e2e simulado)
- [ ] README: `--format sarif|markdown|annotations` + sección GitHub Action
- [ ] `docs/01` FR-40 ampliada; `docs/05` §3 ajustado al action real
- [ ] Tag `v0.5.0-action`
- [ ] tasks/f5 cerrados

## Changelog del plan

- 2026-09-24 · Plan inicial desde specs f5 (tras tag v0.4.0-mcp).
