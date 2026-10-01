# Plan f13-mini-validator · Mini-validador de ejemplos

| Campo     | Valor                                              |
| --------- | -------------------------------------------------- |
| Estado    | completada                                        |
| Fase      | 13 (backlog [f17](f17-diferenciales.md) T2 #6)     |
| Fecha     | 2026-09-30                                         |
| Deriva de | [spec f13-mini-validator](../specs/f13-mini-validator.md) (`ready`) |

## M17.6 — validate-examples

1. `packages/core/src/examples.ts`: `validateExamples` (subset §2, refs con
   ciclos, budgets depth/size) → findings EXVAL-001/002 + counts.
2. CLI `ankaa validate-examples` (gated, skills/severity reuso diff, sink
   estándar, counts en console).
3. Tests core (subset/refs/budgets/determinismo) + e2e (AC-MV.2..5).
4. Docs (README, índices) + cierre T2 en el backlog f17.

## Definition of done

- AC-MV.1…6 verdes; `pnpm check` + invariantes verdes; spec → `implementada`.

## Changelog

- 2026-09-30 · Plan creado con decisiones delegadas por el dueño.
- 2026-10-01 · M17.6 completo: AC-MV.1..6 verdes, `pnpm check` verde,
  Tier 2 del backlog f17 cerrado.
