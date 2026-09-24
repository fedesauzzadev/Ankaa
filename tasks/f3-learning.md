# Tasks · f3-learning

Plan: [plans/f3-learning.md](../plans/f3-learning.md) · Specs: `f3-skills`, `f3-learn`, `f3-init`

---

## M3.1 — Skills load/apply (spec f3-skills)

- [x] `skills.ts`: parse suppressions/severities/drafts schema v1
- [x] Resolución skillsDir (config > default) relative config dir (+ `--skills-dir` flag)
- [x] Wire post-evaluate: severity override → suppress → count → sort → baseline
- [x] `summary.skillsSuppressed` + console `(skills: N suppressed)`
- [x] Drafts `draft: true` no se evalúan
- [x] Errores load → exit 2 con path
- [x] Tests AC-S.1…10
- [x] Spec f3-skills → `implementada`

---

## M3.2 — Learn + skills CLI (spec f3-learn)

- [x] feedback.json schema + mapeo decisions
- [x] learn upsert estable (INV-5) en suppressions/severities/drafts
- [x] CLI `learn --report --feedback [--dry-run] [--skills-dir]`
- [x] `skills list` (+ `--format json`)
- [x] `skills promote <id>` flip draft → active
- [x] reason default FP; severity_change sin finding → exit 2
- [x] validateRule en suggest_rule
- [x] Tests AC-L.1…12 + INV-5 byte-idempotent
- [x] Spec f3-learn → `implementada`

---

## M3.3 — Init + cierre fase 3

- [x] `init [dir] [--force] [--skills-dir]` scaffold
- [x] Respetar skillsDir existente en config
- [x] AC-I.1…6 tests
- [x] E2E S4: analyze → feedback → learn → re-analyze
- [x] Help/README/índices f3
- [x] `pnpm check` verde
- [x] Specs f3-* → `cerrada`
- [x] DoD plans/f3-learning.md
- [x] Tag `v0.3.0-learning`
