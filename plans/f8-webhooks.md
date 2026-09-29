# Plan · f8-webhooks · Soporte webhooks/HTTP callbacks (M8.9, protocolo 4)

| Campo        | Valor                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Specs        | f8-webhooks                                                                              |
| Dependencias | `f8-asyncapi` cerrado (plantilla sniff + pack + CLI); `yaml` existente; cero deps nuevas |

## M8.9 — Parser + pack + CLI por sniff

1. `packages/webhooks` (scaffold + `src/parse.ts`: `looksLikeWebhooks` + `parseWebhooks` según mapeo §2 + `src/index.ts` + `test/parse.test.ts`); dep `yaml`; refs en `tsconfig` raíz y `packages/cli`.
2. `packs/webhooks` (`pack.yaml` + `rules/webhooks.yaml` 6 reglas + `sources.yaml` + `CHANGELOG.md`).
3. CLI: sniff en `analyze.ts` para yaml/json/stdin (webhooks solo si no hay `openapi:`/`swagger:`/`asyncapi:` en la ventana) + `loadProtocol("webhooks")`; discovery `webhooks.*`; `copy-packs` + `lookupRules` + `PROTOCOL_PACKS` + `knownIds` en `analyze-setup.ts`.
4. Fixtures `fixtures/webhooks/` (válido + inválido + sin-events + openapi-3.1-con-webhooks para regresión de sniff).
5. Tests: unit + `webhooks-pack.test.ts` + e2e (incl. regresión OpenAPI/AsyncAPI no robados) + MCP + boundary/INV.
6. README (sumar webhooks) + índices. Sin cambios de contrato ajeno.
7. `pnpm check` verde → spec `cerrada` (+ anotar cierre del umbrella M8.6 en `f8-oss-differentials`).

**DoD:** AC-WH.1—7 verdes; suites REST/GraphQL/gRPC/AsyncAPI intactas.

## Notas para el agente

- Commits sin comillas dobles embebidas (quirk PowerShell).
- `pnpm build` tras tocar `packages/*/src`.
- El sniff debe ser conservador: ante la duda, OpenAPI (comportamiento actual). Test de regresión obligatorio con OpenAPI 3.1 que traiga sección `webhooks:`.

## Changelog del plan

- 2026-09-27 · Plan inicial (handoff).
