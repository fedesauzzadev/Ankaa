# Plan f17-compliance-pack · Evidencia de compliance offline

| Campo     | Valor                                            |
| --------- | ------------------------------------------------ |
| Estado    | cerrado (M17.5 completo)                |
| Fase      | 17 (backlog [f17](f17-diferenciales.md) T2 #4)   |
| Fecha     | 2026-09-30                                       |
| Deriva de | [spec f17-compliance-pack](../specs/f17-compliance-pack.md) (`ready`) |

## M17.5 — PII + controls

1. Core: átomo `examplePii` (rule.ts + validate.ts + atoms.ts + coverage.ts).
2. Pack elite: `rules/privacy.yaml` (PRIV-001) + `compliance-mappings.yaml`
   + CHANGELOG + test de conteo 95→96.
3. CLI: `export --controls` (args + export.ts `buildControlsSection` +
   index.ts carga mappings del pack embebido).
4. Tests: core átomo true/false; cli PRIV-001 fixture + export e2e.
5. Docs: README + índices + fix referencias M17.5 de ratchet.

## Definition of done

- AC-CP.1…7 verdes; `pnpm check` + invariantes verdes; spec → `implementada`.

## Changelog

- 2026-09-30 · Plan creado con decisiones delegadas por el dueño.
- 2026-09-30 · M17.5 completo: átomo + PRIV-001 (96) + mappings + export
  `--controls` + 9 tests · `pnpm check` verde · spec → `implementada`.
