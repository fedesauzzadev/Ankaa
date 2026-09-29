# Tasks · f1-resilience (robustez batch + observabilidad local)

Specs: [f1-analyze](../specs/f1-analyze.md) (AC-A.14–16) · [f8-scan-org](../specs/f8-scan-org.md) (AC-SO.11). Sin plan nuevo: enmiendas a specs cerradas, sin cambio de arquitectura.

- [x] `analyzeUseCase`: junta errores por input, sigue con todos, exit 2 sin reporte parcial; un solo input mantiene mensaje exacto
- [x] e2e batch: válidos + 2 inválidos → exit 2, ambos labels en stderr, `--output` no creado
- [x] scan-org: `note: scanned …` por repo + `warning: skipped …` a stderr; stdout JSON intacto
- [x] e2e progreso: stderr contiene notas de repo-a/b/c y warning de repo-empty
- [x] bin: try/catch → `error: internal failure`, exit 2 + test estático `bin-guard.test.ts`
- [x] `pnpm check` verde + `format:check` + ACs en `[x]` + índices
