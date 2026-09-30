# Plan f17-migration-kit · Migración de excepciones (redocly/vacuum → skills)

| Campo     | Valor                                                    |
| --------- | -------------------------------------------------------- |
| Estado    | cerrado (M17.3 completo)                                |
| Fase      | 17 (backlog [f17](f17-diferenciales.md) T1 #2, excepciones) |
| Fecha     | 2026-09-30                                               |
| Deriva de | [spec f17-migration-kit](../specs/f17-migration-kit.md) (`ready`) |

## M17.3 — migrate exceptions (redocly + vacuum)

1. `skills.ts`: loader extendido — `migrated/*.yaml` con el mismo schema de
   suppressions, merge determinista, conteo visible en `skills list`.
2. `packages/cli/src/migrate.ts`: parsers redocly/vacuum, convertidor
   JSONPath→pointer, matching por location contra findings crudos (pipeline
   en memoria como `fix`), writer idempotente a `skills/migrated/<origin>.yaml`.
3. CLI `ankaa migrate` (gated; `--dry-run`; rechazo explícito de
   `--spectral-rules`/`--spectral-disables` con puntero al spec).
4. Tests unit + e2e (AC-MG.1…9) + docs (README, índices).

## Definition of done

- AC-MG.1…10 verdes; `pnpm check` + invariantes verdes; spec → `implementada`.

## Changelog

- 2026-09-30 · Plan creado con el alcance v0 aprobado en la spec.
- 2026-09-30 · M17.3 completo: `migrate.ts` + loader `migrated/*.yaml` +
  comando `ankaa migrate` + 13 tests · `pnpm check` verde · spec →
  `implementada`. Piezas Spectral quedan como follow-up documentado en la
  spec (§2 Out).
