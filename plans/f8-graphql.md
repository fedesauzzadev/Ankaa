# Plan · f8-graphql · Soporte GraphQL SDL (M8.6, protocolo 1)

| Campo | Valor |
|---|---|
| Specs | f8-graphql |
| Dependencias | analyze/analyze-setup/loaders/pack-fs/discovery existentes; `graphql` npm (nueva dep, justificada en spec §6) |

## M8.6 — Adapter + pack + CLI

1. `packages/graphql` (nuevo: `package.json` MIT, `tsconfig`, `src/parse.ts` + `src/index.ts`, `test/`): `parseGraphQL` SDL → `Spec` según mapeo del spec §2; `pnpm add graphql` en ese workspace; referencia en `tsconfig.json` raíz.
2. `packs/graphql` (`pack.yaml` + `rules/*.yaml`): 8 reglas curadas con átomos existentes + `sources.yaml` + `CHANGELOG.md`.
3. CLI: `analyze-setup` elige parser+pack por extensión; `discovery.ts` patrones `schema.{graphql,gql}`; sin flags nuevos.
4. Fixtures `fixtures/graphql/` (schema válido con Query/Mutation/Subscription + `extend`, SDL inválido, sin-roots, fragmento cliente).
5. Tests: unit adapter + `graphql-pack.test.ts` (true+false + conteo) + e2e analyze + boundary/INV-1/2/7.
6. README (formatos soportados) + índices (specs/plans/tasks). Sin cambios de contrato ajeno → sin changelogs cruzados.
7. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-GQL.1—8 verdes; `analyze` OpenAPI byte-idéntico (regresión: suite existente verde sin tocar fixtures).

## Notas para el agente

- Commits sin comillas dobles embebidas (quirk PowerShell).
- Reglas YAML validadas contra `dist` del core; `pnpm build` tras tocar `packages/*/src` (los tests CLI resuelven `dist`).
- `packages/graphql` puro: si el boundary ladra por `graphql-js`, verificar que solo se importa `parse`/`Kind` (nada de red).

## Changelog del plan

- 2026-09-27 · Plan inicial (handoff).
- 2026-09-27 · M8.6 implementado + DoD cumplido (`pnpm check` verde: AC-GQL.1—8 con pack sincerado a 8 reglas, INV-1/2/7; `analyze` OpenAPI sin cambios).
