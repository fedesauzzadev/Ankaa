# Plan · f10-export · Contrato JSON enterprise (M10.2)

| Campo        | Valor                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| Specs        | f10-export                                                              |
| Dependencias | Ninguna nueva; edición empresarial (gate por tier cuando F7 los defina) |

## M10.2 — Comando export + ejemplos

1. CLI `export` (puro: agrupa por dueño, filtra por `--since`, escribe `--out`) + `src/export.ts`.
2. `examples/integrations/` (jira/stub, slack, csv) como referencia.
3. Tests unit + e2e + determinismo + INV-7.
4. README + índices.
5. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-EX.1—5 verdes.

## Changelog del plan

- 2026-09-28 · Plan inicial (handoff).
