# Plan · f2-governance · config + custom rules + baseline

| Campo | Valor |
|---|---|
| Specs | f2-config, f2-custom-rules, f2-baseline |
| Esfuerzo estimado | 1 semana (1 dev full-time equivalente) |
| Dependencias | f1 cerrado (`v0.1.0-mvp`) |
| Milestones | M2.1–M2.3 |

## Estrategia

**Adopción sin dolor:** primero que la config sea confiable (typos fallan), luego reglas de equipo validables, al final baseline (el gate "solo lo nuevo" que vende la fase).

```
M2.1 custom rules validate/list + colisiones
M2.2 config full (customRules, baseline block, strict unknown)
M2.3 baseline write/filter + suppressed + e2e criterio salida
```

M2.1 y M2.2 se pueden invertir si conviene cerrar config temprano; baseline (M2.3) va al final porque toca use case + reporters + flags.

## M2.1 — Custom rules end-to-end (spec f2-custom-rules)

**Alcance:** endurecer lo ya parcial de f1 + `rules validate` / `rules list`.

Pasos:

1. Extraer `loadRulesFile`/`stampCustomRules` a módulo propio (`custom-rules.ts`) con soporte multi-file y errores con path.
2. Colisión de ids: duplicate custom ⇒ exit 2; custom vs elite ⇒ exit 2.
3. `rules validate <files...>` (exit 0/2, `--format json`).
4. `rules list` (+ `--rules` para custom al final).
5. `rules explain` extiende a custom cuando hay `--rules`.
6. Tests AC-R2.1…10.

**DoD:** AC-R2 verdes; no-regresión e2e f1.

## M2.2 — Config completa (spec f2-config)

**Alcance:** schema estricto + `customRules` + bloque `baseline` (parse; flags baseline en M2.3).

Pasos:

1. Unknown top-level key → error; allowlist `skillsDir`.
2. `customRules: string | string[]`; resolución relative al config dir.
3. Precedencia documentada y tests (failOn, union custom).
4. Merge con M2.1 (config files → `--rules` → `--rule`).
5. Ejemplo en README/`examples/apigovscan.yaml`.
6. Bloque `baseline` parseado (enabled/path/strictHash) sin implementar filtro aún (flag unknown hasta M2.3 o se adelantan flags de args — decisión: parsear config, flags en M2.3).

**DoD:** AC-C.1…9 verdes; configs f1 válidas no rompen.

## M2.3 — Baseline (spec f2-baseline)

**Alcance:** FR-20…22; criterio de salida Fase 2.

Pasos:

1. Args: `--write-baseline`, `--baseline`, `--baseline-path`, `--force`, `--strict-hash`, `--baseline-ignore-hash`.
2. módulo baseline: build/load/filter (core o cli — **decisión:** pure helpers en `packages/cli/src/baseline.ts` o core si reporters necesitan; preferir `cli` + fingerprint de core).
3. Wire en `analyzeUseCase`: filtro post-evaluate, `summary.suppressed`, console `(baseline: N suppressed)`.
4. Reporters: habilitar `suppressed` opcional en canónico/summary.
5. Write path `.apigovscan/` + force/bak; INV-7.
6. E2E criterio salida: baseline + finding nuevo ⇒ exit 1 solo por nuevo.
7. Config `baseline.enabled` ↔ flags.

**DoD:** AC-B.1…12 verdes; SDD criterio salida fase 2 cumplido.

## Orden de merge recomendado (PRs)

1. `feat/custom-rules-validate` (M2.1)
2. `feat/config-full` (M2.2)
3. `feat/baseline` (M2.3)

## Riesgos del plan

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Baseline esconde reglas de seguridad nuevas no intencionalmente | Confianza | Conteo suppressed siempre visible; write imprime counts; review de baseline en PR como código |
| Config strict rompe configs ad-hoc de usuarios f1 | Fragua | Allowlist corta; error claro con key unknown; changelog |
| Colisión id custom/elite molesta | UX | Mensaje apunta a `rules:` override, no a redefinir |
| Fingerprint inestable rompe baseline | Filtro no matchea | INV-5 ya en f1; golden tests |
| Scope creep hacia skills dentro de baseline | Demora | Specs f2 explícitos: skills = f3 |

## Definition of Done (fase 2 completa)

- [ ] Specs `f2-*` todos en estado `cerrada`
- [ ] `pnpm check` verde matriz OS
- [ ] Criterio salida SDD Fase 2: proyecto con deuda + baseline; `--baseline` solo falla lo nuevo
- [ ] README: secciones config, custom rules, baseline
- [ ] Tag `v0.2.0-governance`
- [ ] tasks/f2 cerrados

## Changelog del plan

- 2026-09-24 · Plan inicial desde specs f2 (tras tag v0.1.0-mvp).
