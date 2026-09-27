# Plan · f8-asyncapi · Soporte AsyncAPI/eventos (M8.8, protocolo 3)

| Campo | Valor |
|---|---|
| Specs | f8-asyncapi |
| Dependencias | `f8-grpc` cerrado (plantilla); `yaml` existente; cero deps nuevas |

## M8.8 — Parser v2+v3 + pack + CLI por sniff

1. `packages/asyncapi` (scaffold + `src/parse.ts`: `looksLikeAsyncApi` + `parseAsyncAPI` v2/v3 + `src/index.ts` + `test/parse.test.ts`); dep `yaml`; refs en `tsconfig` raíz y `packages/cli`.
2. `packs/asyncapi` (`pack.yaml` + `rules/asyncapi.yaml` 6 reglas + `sources.yaml` + `CHANGELOG.md`).
3. CLI: sniff en `analyze.ts` para yaml/json/stdin + `loadProtocol("asyncapi")`; discovery `asyncapi.*`; `copy-packs` + `lookupRules` + `PROTOCOL_PACKS`.
4. Fixtures `fixtures/asyncapi/` (v2 + v3 + inválido + sin-ops).
5. Tests: unit + `asyncapi-pack.test.ts` + e2e (incl. regresión no-sniff OpenAPI) + MCP + boundary/INV.
6. README (sumar AsyncAPI) + índices. Sin cambios de contrato ajeno.
7. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-AS.1—7 verdes; suites REST/GraphQL/gRPC intactas.

## Notas para el agente

- Commits sin comillas dobles embebidas (quirk PowerShell).
- `pnpm build` tras tocar `packages/*/src`.
- El sniff debe ser conservador: ante la duda, OpenAPI (comportamiento actual).

## Changelog del plan

- 2026-09-27 · Plan inicial (handoff).
- 2026-09-27 · M8.8 implementado + DoD cumplido (`pnpm check` verde: AC-AS.1—7, INV-1/2/7; suites REST/GraphQL/gRPC intactas).
