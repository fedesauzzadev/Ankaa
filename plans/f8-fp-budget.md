# Plan f8-fp-budget · Métrica de feedback por regla

| Campo     | Valor                                  |
| --------- | -------------------------------------- |
| Estado    | cerrado (M17.1 completo)               |
| Fase      | 8 (backlog [f17](f17-diferenciales.md) T1 #3) |
| Fecha     | 2026-09-30                             |
| Deriva de | [spec f8-fp-budget](../specs/f8-fp-budget.md) (`ready`) |

## Objetivo

`ankaa skills stats`: informe local, determinista y no-mutante del FP rate por
regla a partir de feedback de `learn` + tracking del dashboard.

## M17.1 — skills stats (slice único)

Orden de construcción:

1. `packages/cli/src/fp-stats.ts`: `buildFpStats` pura (reports + feedbacks +
   trackings + settings → stats) reusando loaders de `learn.ts` y
   `loadTrackingFile` de `dashboard.ts`.
2. CLI: subcomando `skills stats` en `runSkillsCommand` (flags propios,
   dispatch antes del loop genérico), usage actualizado.
3. Tests: unit `fp-stats.test.ts` (AC-FP.1…7) + e2e (AC-FP.8/9, INV-7).
4. Docs: README (sección Skills) + índices.

Riesgos: ninguno arquitectural (solo lectura + `--output` explícito).

## Definition of done

- AC-FP.1…10 de la spec verdes; `pnpm check` + invariantes verdes.
- Spec → `implementada`; tasks marcadas; README actualizado.

## Changelog

- 2026-09-30 · Plan creado tras aprobación del dueño (decisiones en la spec).
- 2026-09-30 · M17.1 completo: `fp-stats.ts` + `skills stats` + 12 tests ·
  `pnpm check` verde · spec → `implementada`.
