# Tasks · f17-ratchet

Plan: [plans/f17-ratchet.md](../plans/f17-ratchet.md) · Spec: [specs/f17-ratchet.md](../specs/f17-ratchet.md)

## M17.4 — ratchet gate

- [x] `computeRatchetStats` pura en `baseline.ts` (new/resolved/net, gate severity, semántica skills)
- [x] Flags `--ratchet` / `--ratchet-severity` en `args.ts` con validaciones
- [x] `analyze.ts`: `summary.ratchet` + exit code combinado; reporters console/markdown nota
- [x] `index.ts`: wiring + help + validación de baseline lectura
- [x] Tests unit (computeRatchetStats) + e2e (AC-RA.1…5)
- [x] README flags + matriz fail-on × ratchet + índices
- [x] `pnpm check` verde
- [x] Spec `f17-ratchet` → `implementada`
