# Plan f17-ratchet · Gate de deuda no creciente

| Campo     | Valor                                         |
| --------- | --------------------------------------------- |
| Estado    | cerrado (M17.4 completo)                |
| Fase      | 17 (backlog [f17](f17-diferenciales.md) T2 #5) |
| Fecha     | 2026-09-30                                    |
| Deriva de | [spec f17-ratchet](../specs/f17-ratchet.md) (`ready`) |

## M17.4 — ratchet gate

1. `baseline.ts`: `computeRatchetStats` pura (new/resolved/net por severidad
   de gate, semántica de skills documentada).
2. `args.ts`: `--ratchet` + `--ratchet-severity` (validaciones).
3. `analyze.ts`: opts + summary.ratchet + exit code combinado;
   `reporters/build|console|markdown`: summary + nota.
4. `index.ts`: wiring, validación de baseline lectura, help.
5. Tests unit + e2e (AC-RA.1…6) + docs (README flags + matriz).

## Definition of done

- AC-RA.1…7 verdes; `pnpm check` + invariantes verdes; spec → `implementada`.

## Changelog

- 2026-09-30 · Plan creado con decisiones delegadas por el dueño.
- 2026-09-30 · M17.4 completo: ratchet gate + summary.ratchet + 8 tests ·
  `pnpm check` verde · spec → `implementada`.
