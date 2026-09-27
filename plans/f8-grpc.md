# Plan · f8-grpc · Soporte proto/gRPC (M8.7, protocolo 2)

| Campo | Valor |
|---|---|
| Specs | f8-grpc |
| Dependencias | `f8-graphql` cerrado (plantilla adapter+pack+CLI); cero deps nuevas |

## M8.7 — Parser propio + pack + CLI

1. `packages/grpc` (scaffold + `src/parse.ts` tokenizer/recursive-descent + `src/index.ts` + `test/parse.test.ts`): `parseProto` según mapeo §2; referencia en `tsconfig.json` raíz; dep en `packages/cli/package.json`.
2. `packs/grpc` (`pack.yaml` + `rules/grpc.yaml` 7 reglas + `sources.yaml` + `CHANGELOG.md`).
3. CLI: `isGrpcInput` en `analyze.ts` + `loadProtocol("grpc")`; discovery `**/*.proto`; `copy-packs` + `lookupRules` + helper `rules explain` generalizado a packs de protocolo.
4. Fixtures `fixtures/grpc/` (válido con streaming/nested/oneof/map + inválido + sin-services).
5. Tests: unit + `grpc-pack.test.ts` + e2e + MCP + boundary/INV.
6. README (sumar proto a la fila analyze) + índices. Sin cambios de contrato ajeno.
7. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-GR.1—7 verdes; suites REST/GraphQL intactas (regresión verde sin tocar sus fixtures).

## Notas para el agente

- Commits sin comillas dobles embebidas (quirk PowerShell).
- `pnpm build` tras tocar `packages/*/src` (tests CLI resuelven `dist` + copia de packs).
- El parser debe ser total: ningún input válido/inválido puede crashear — error honesto con línea o warning agregado.

## Changelog del plan

- 2026-09-27 · Plan inicial (handoff).
