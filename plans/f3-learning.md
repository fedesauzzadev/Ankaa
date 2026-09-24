# Plan · f3-learning · init + skills + learn

| Campo | Valor |
|---|---|
| Specs | f3-init, f3-skills, f3-learn |
| Esfuerzo estimado | 1 semana (1 dev full-time equivalente) |
| Dependencias | f2 cerrado (`v0.2.0-governance`) |
| Milestones | M3.1–M3.3 |

## Estrategia

**Primero que analyze lea skills** (valor inmediato si el usuario edita YAML a mano), **después learn** (escribe lo que el loader entiende), **al final init** como UX de onboarding (puede ir en paralelo con M3.1). Criterio de salida SDD: flujo report→feedback→learn→re-analyze + INV-5.

```
M3.1 skills load/apply en analyze + schema (f3-skills)
M3.2 learn + skills list/promote (f3-learn) + INV-5
M3.3 init scaffold + e2e S4 completo + cierre fase
```

Init (M3.3) va al final para no bloquear; el e2e S4 puede crear skills a mano en M3.1–M3.2.

## M3.1 — Skills en analyze (spec f3-skills)

**Alcance:** loader + suppress + severity override + drafts no activos.

Pasos:

1. `packages/cli/src/skills.ts`: parse suppressions/severities/drafts (schema estricto v1).
2. Resolución `skillsDir` desde config (f2) o default; relative a config dir.
3. Wire post-evaluate en `analyzeUseCase` (o filtro en CLI como baseline): severity overrides → suppressions → count → sort → baseline.
4. `summary.skillsSuppressed` + console note.
5. Tests AC-S.1…10.

**DoD:** AC-S verdes; no-regresión sin skillsDir.

## M3.2 — Learn + skills CLI (spec f3-learn)

**Alcance:** FR-31/32, INV-5.

Pasos:

1. Schema `feedback.json` + mapeo decisions → estructuras skills.
2. `learnUseCase` / `packages/cli/src/learn.ts`: load report + feedback → patch skills (upsert estable).
3. CLI: `learn --report --feedback [--dry-run] [--skills-dir]`.
4. `skills list` / `skills promote`.
5. Tests AC-L.1…12, en particular INV-5 byte-idempotente.

**DoD:** AC-L verdes; dry-run no escribe.

## M3.3 — Init + cierre (spec f3-init + e2e fase)

**Alcance:** FR-30 + flujo S4 completo.

Pasos:

1. `init` scaffold (config + skills empties + README).
2. E2E S4: init → analyze → feedback → learn → re-analyze (o variante sin init si scaffold a mano).
3. Help/README/índices; `pnpm check`; specs → `implementada`/`cerrada`; tag `v0.3.0-learning`.

**DoD:** AC-I verdes; criterio salida SDD fase 3; INV-5 en CI.

## Orden de merge recomendado

1. `feat/skills-apply` (M3.1)
2. `feat/learn` (M3.2)
3. `feat/init` (M3.3)

## Riesgos del plan

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Suppressions esconden deuda de seguridad | Confianza | reason obligatorio; conteo visible; review en PR |
| INV-5 roto por timestamps | Flaky | no createdAt en v1; test byte equality |
| skills + baseline confunden contadores | UX | campos separados + console notes |
| Regex de apiPath insegura | Crash/hang | reusar safe-regex del engine + límite |
| Scope creep a learn UI | Demora | feedback JSON only en f3 |

## Definition of Done (fase 3 completa)

- [x] Specs `f3-*` en estado `cerrada`
- [x] `pnpm check` verde
- [x] INV-5 con test en CI
- [x] Criterio SDD: flujo report→feedback→learn→re-analyze demostrado (e2e)
- [x] README: init, skills, learn
- [ ] Tag `v0.3.0-learning`
- [x] tasks/f3 cerrados

## Changelog del plan

- 2026-09-24 · Plan inicial desde specs f3 (tras tag v0.2.0-governance).
- 2026-09-24 · M3.1–M3.3 implementados; DoD verde salvo tag `v0.3.0-learning`.
