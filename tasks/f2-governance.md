# Tasks · f2-governance

Plan: [plans/f2-governance.md](../plans/f2-governance.md) · Specs: `f2-custom-rules`, `f2-config`, `f2-baseline`

---

## M2.1 — Custom rules (spec f2-custom-rules)

- [x] Extraer loader/stamp de `index.ts` → `custom-rules.ts` multi-file
- [x] Errores con file path + index (`invalid custom rule`)
- [x] Colisión duplicate custom id → exit 2 (AC-R2.4)
- [x] Colisión custom vs elite id → exit 2 (AC-R2.5)
- [x] `rules validate <files...>` + `--format json` (AC-R2.1…3, AC-R2.10)
- [x] `rules list` (+ optional `--rules`) (AC-R2.6)
- [x] `rules explain` considera custom con `--rules` (AC-R2.7)
- [x] e2e finding TEAM-001 (AC-R2.8)
- [x] no-regresión strictSource pack (AC-R2.9)
- [x] help/README actualizados
- [x] Spec f2-custom-rules → AC verdes → `implementada`

---

## M2.2 — Config completa (spec f2-config)

- [ ] Unknown top-level key → exit 2 (AC-C.1)
- [ ] Allowlist `skillsDir` parse-only (AC-C.7)
- [ ] `customRules` string | list (AC-C.2)
- [ ] Resolución de rutas relative al config dir (AC-C.5)
- [ ] Precedencia failOn flag > config (AC-C.3)
- [ ] customRules path missing → exit 2 (AC-C.4)
- [ ] Merge config + `--rules` + `--rule` orden estable (AC-C.8)
- [ ] No-regresión config f1 (AC-C.6)
- [ ] Ejemplo config (AC-C.9)
- [ ] Bloque `baseline` parseado (enabled/path/strictHash)
- [ ] `standards.version` mismatch embed → warning (si aplica)
- [ ] Spec f2-config → AC verdes → `implementada`

---

## M2.3 — Baseline (spec f2-baseline)

### Core/reporters

- [ ] `summary.suppressed` en Report + canonical + hash (decisión spec)
- [ ] Console `(baseline: N suppressed)` (AC-B.8)

### CLI baseline

- [ ] Args: `--write-baseline`, `--baseline`, `--baseline-path`, `--force`, `--strict-hash`, `--baseline-ignore-hash`
- [ ] build/load baseline JSON schema v1 (AC-B.1, AC-B.7)
- [ ] Fingerprints sort unique + determinism (AC-B.9)
- [ ] Filter post-evaluate → exit code solo sobre visibles (AC-B.3, AC-B.4, AC-B.12)
- [ ] Write `.apigovscan/baseline.json` + force/bak (AC-B.2)
- [ ] Missing baseline → exit 2 (AC-B.6)
- [ ] inputHash warn / strict / ignore (AC-B.5)
- [ ] No write en read mode (AC-B.10, INV-7)
- [ ] Config `baseline.enabled` e2e (AC-B.11)
- [ ] Multi-input directory baseline
- [ ] Help/README baseline
- [ ] Spec f2-baseline → AC verdes → `implementada`

### Cierre fase 2

- [ ] `pnpm check` verde
- [ ] Actualizar specs/README.md índice f2
- [ ] Revisar DoD plans/f2-governance.md
- [ ] Tag `v0.2.0-governance`
