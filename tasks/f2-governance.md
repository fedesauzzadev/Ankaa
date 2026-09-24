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

- [x] Unknown top-level key → exit 2 (AC-C.1)
- [x] Allowlist `skillsDir` parse-only (AC-C.7)
- [x] `customRules` string | list (AC-C.2)
- [x] Resolución de rutas relative al config dir (AC-C.5)
- [x] Precedencia failOn flag > config (AC-C.3)
- [x] customRules path missing → exit 2 (AC-C.4)
- [x] Merge config + `--rules` + `--rule` orden estable (AC-C.8)
- [x] No-regresión config f1 (AC-C.6)
- [x] Ejemplo config (AC-C.9)
- [x] Bloque `baseline` parseado (enabled/path/strictHash)
- [x] `standards.version` mismatch embed → warning
- [x] Spec f2-config → AC verdes → `implementada`

---

## M2.3 — Baseline (spec f2-baseline)

### Core/reporters

- [x] `summary.suppressed` en Report + canonical + hash (decisión spec)
- [x] Console `(baseline: N suppressed)` (AC-B.8)

### CLI baseline

- [x] Args: `--write-baseline`, `--baseline`, `--baseline-path`, `--force`, `--strict-hash`, `--baseline-ignore-hash`
- [x] build/load baseline JSON schema v1 (AC-B.1, AC-B.7)
- [x] Fingerprints sort unique + determinism (AC-B.9)
- [x] Filter post-evaluate → exit code solo sobre visibles (AC-B.3, AC-B.4, AC-B.12)
- [x] Write `.apigovscan/baseline.json` + force/bak (AC-B.2)
- [x] Missing baseline → exit 2 (AC-B.6)
- [x] inputHash warn / strict / ignore (AC-B.5)
- [x] No write en read mode (AC-B.10, INV-7)
- [x] Config `baseline.enabled` e2e (AC-B.11)
- [x] Multi-input directory baseline
- [x] Help/README baseline
- [x] Spec f2-baseline → AC verdes → `implementada`

### Cierre fase 2

- [x] `pnpm check` verde
- [x] Actualizar specs/README.md índice f2
- [x] Revisar DoD plans/f2-governance.md
- [x] Tag `v0.2.0-governance`
