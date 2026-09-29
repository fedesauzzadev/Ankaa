# Tasks · f8-legacy-convert

Plan: [plans/f8-legacy-convert.md](../plans/f8-legacy-convert.md) · Spec: [specs/f8-legacy-convert.md](../specs/f8-legacy-convert.md)

## M8.10 — legacy Swagger → Spec

- [x] `packages/openapi`: `src/legacy.ts` + hook en `parse.ts` (detección 1.x/2.0 + warning `SWAGGER_CONVERTED`) + tests unit
- [x] Fixtures `fixtures/swagger1-minimal.yaml` (+ ataque remoto si falta)
- [x] CLI: discovery `swagger.*` + retirar error `SWAGGER_20`
- [x] Tests: `legacy.test.ts` + e2e (`swagger-analyze`) + regresión 3.x + boundary/INV
- [x] README + índices
- [x] `pnpm check` verde
- [x] Spec `f8-legacy-convert` → `cerrada` + índices
