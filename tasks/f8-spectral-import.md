# Tasks · f8-spectral-import

Plan: [plans/f8-spectral-import.md](../plans/f8-spectral-import.md) · Spec: [specs/f8-spectral-import.md](../specs/f8-spectral-import.md)

## M17.9 — transpiler shapes S1..S7

- [x] Vendor `packages/cli/src/vendor-oas.ts` (serialización determinista + atribución)
- [x] Resolver extends (vendor + locales depth 5) + merge de overrides del usuario
- [x] Clasificador: covered-elite (14) / shapes S1..S7 / skip con motivo
- [x] Emisor: draft YAML SPEC-NNN validado por validateRule + resumen imported/skipped
- [x] CLI `ankaa migrate --spectral-rules <ruleset>` + help
- [x] Tests: shapes true/false, extends/overrides, covered-skip, límites, e2e, determinismo
- [x] README + índices + changelog backlog f17
- [x] `pnpm check` verde
- [x] Spec `f8-spectral-import` → `implementada`
