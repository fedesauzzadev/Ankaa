# Tasks · f3-learning

Plan: [plans/f3-learning.md](../plans/f3-learning.md) · Specs: `f3-skills`, `f3-learn`, `f3-init`

---

## M3.1 — Skills load/apply (spec f3-skills)

- [ ] `skills.ts`: parse suppressions/severities/drafts schema v1
- [ ] Resolución skillsDir (config > default) relative config dir
- [ ] Wire post-evaluate: severity override → suppress → count → sort → baseline
- [ ] `summary.skillsSuppressed` + console `(skills: N suppressed)`
- [ ] Drafts `draft: true` no se evalúan
- [ ] Errores load → exit 2 con path
- [ ] Tests AC-S.1…10
- [ ] Spec f3-skills → `implementada`

---

## M3.2 — Learn + skills CLI (spec f3-learn)

- [ ] feedback.json schema + mapeo decisions
- [ ] learn upsert estable (INV-5) en suppressions/severities/drafts
- [ ] CLI `learn --report --feedback [--dry-run] [--skills-dir]`
- [ ] `skills list` (+ `--format json`)
- [ ] `skills promote <id>` flip draft → active
- [ ] reason default FP; severity_change sin finding → exit 2
- [ ] validateRule en suggest_rule
- [ ] Tests AC-L.1…12 + INV-5 byte-idempotent
- [ ] Spec f3-learn → `implementada`

---

## M3.3 — Init + cierre fase 3

- [ ] `init [dir] [--force] [--skills-dir]` scaffold
- [ ] Respetar skillsDir existente en config
- [ ] AC-I.1…6 tests
- [ ] E2E S4: analyze → feedback → learn → re-analyze
- [ ] Help/README/índices f3
- [ ] `pnpm check` verde
- [ ] Specs f3-* → `cerrada`
- [ ] DoD plans/f3-learning.md
- [ ] Tag `v0.3.0-learning`
