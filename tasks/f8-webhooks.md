# Tasks · f8-webhooks

Plan: [plans/f8-webhooks.md](../plans/f8-webhooks.md) · Spec: [specs/f8-webhooks.md](../specs/f8-webhooks.md)

## M8.9 — webhooks/HTTP callbacks (protocolo 4)

- [x] `packages/webhooks`: scaffold + `parseWebhooks` (mapeo §2) + `looksLikeWebhooks` + tests unit
- [x] `packs/webhooks`: pack.yaml + 6 reglas + sources + CHANGELOG
- [x] CLI: routing por sniff (conservador: no robar OpenAPI/AsyncAPI) + discovery `webhooks.*` + copy-packs + explain
- [x] Fixtures `fixtures/webhooks/` (válido + inválido + sin-events + openapi-3.1-con-webhooks)
- [x] Tests: `webhooks-pack.test.ts` + e2e (regresión OpenAPI/AsyncAPI) + MCP + boundary/INV
- [x] README + índices
- [x] `pnpm check` verde
- [x] Spec `f8-webhooks` → `cerrada` + índices (+ anotar cierre umbrella M8.6)
