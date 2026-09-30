# Tasks · f17-migration-kit

Plan: [plans/f17-migration-kit.md](../plans/f17-migration-kit.md) · Spec: [specs/f17-migration-kit.md](../specs/f17-migration-kit.md)

## M17.3 — migrate exceptions (redocly + vacuum)

- [x] `skills.ts`: loader `migrated/*.yaml` + conteo en `skills list`
- [x] `migrate.ts`: parsers redocly/vacuum, JSONPath→pointer, matching por location, writer idempotente
- [x] CLI `ankaa migrate` (gate licencia, `--dry-run`, rechazo explícito de spectral flags)
- [x] Tests unit (parsers, convertidor, matching, determinismo)
- [x] Tests e2e (AC-MG.1/2/4/5/7/8/9)
- [x] README sección migrate + índices
- [x] `pnpm check` verde
- [x] Spec `f17-migration-kit` → `implementada`
