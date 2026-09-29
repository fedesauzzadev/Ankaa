# f8-graphql · Soporte GraphQL SDL en el plano de governance (M8.6, protocolo 1)

| Campo     | Valor                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Estado    | cerrada                                                                                                                              |
| Fecha     | 2026-09-27                                                                                                                           |
| Fase      | 8 (M8.6 del umbrella `f8-oss-differentials`: GraphQL → gRPC → AsyncAPI → webhooks)                                                   |
| Deriva de | `f8-oss-differentials` M8.6; `f1-openapi` (patrón parser → `Spec`); `f1-engine` (sin cambios); `f1-elite-pack` (taxonomía, curación) |

## 1. Objetivo / user story

Como responsable de plataforma con APIs REST **y** GraphQL quiero `apigovscan analyze schema.graphql` y que el score, los findings y los reportes salgan del **mismo motor y los mismos formatos** que para OpenAPI. Sin LLM, sin red, sin cambiar el engine.

**Regla de oro:** el motor ya es agnóstico del formato — GraphQL es **adapter + pack**, igual que `packages/openapi` + `packs/elite`. Si una regla GraphQL honesta necesita un átomo nuevo, queda **fuera** de M8.6 (lección M8.5: techo honesto sin engine nuevo) y se lista en §7.

## 2. Alcance

### In

- **`packages/graphql`** (nuevo, puro como `openapi`: sin `node:fs`, sin net, sin fetch): `parseGraphQL(SDL, opts)` → `Spec` del core. Parser real con `graphql-js` (`graphql` npm, MIT, zero-deps — justificación supply chain en §6; `parse()` es local, INV-1 intacto).
- **Mapeo SDL → `Spec` (documentado, sin mentir):**
  - Cada root field (`Query.*`, `Mutation.*`, `Subscription.*`; `extend type` incluido) = una `Operation`: `method` = `query|mutation|subscription`, `path` = `/Query.fieldName`, `operationId` = `Query.fieldName`, `jsonPointer` análogo (`#/Query/fieldName`).
  - `description` SDL → `description`; `@deprecated(reason)` → `deprecated: true` (+ reason a `description` si no hay).
  - Argumentos del field → `requestBody.content[0].schema.properties` (viajan en el body del POST; habilita `propertyNamingViolation`, `schemaInlineDepthMax`, `additionalPropertiesAbsent` sin átomos nuevos).
  - Tipo de retorno → una `Response` sintética `status: "data"` con `content[0].schema` (habilita `responseHasContent`, `schemaInlineDepthMax` como proxy de costo de query).
  - Directivas custom (`@key`, `@tag`, federation…) → se ignoran salvo `@deprecated`; constan en `parseWarnings` una sola vez (`code: "gql-directives-ignored"`), no por field.
  - Sin `Query`/`schema` → `ok: true` con 0 operations + `parseWarning` (`code: "gql-no-roots"`); es informativo, no error (fragments de cliente no deben romper gates).
  - SDL inválido → `ok: false` con `ParseError[]` (mensaje + línea, formato igual a `openapi`). Mismo `DEFAULT_LIMITS` (10 MB).
- **`packs/graphql`** (nuevo pack versionado, `strictSource: true`): pack inicial **8 reglas** curadas con átomos existentes (Shopify GraphQL Design Tutorial, Apollo Principled GraphQL, GitHub GraphQL guidelines, PayPal GraphQL standards): naming camelCase de fields/args, descripciones, `@deprecated` con reason; solo lo que salga honesto, el resto a §7.
- **CLI `analyze`**: detecta `.graphql`/`.gql` por extensión (SDL; introspection JSON fuera) y usa `parseGraphQL`; pack activo = `packs/graphql` para esos inputs (selección por extensión en `analyze.ts` vía `PackRepository.loadProtocol`, **sin** cambiar el contrato core `Spec` en slice 1). Exit codes y formatos idénticos.
- **Discovery**: patrones `schema.{graphql,gql}` + `**/schema.{graphql,gql}` (solo schemas por nombre — los fragments de cliente `*.graphql` sueltos no se descubren para no romper orgs).
- **Tests**: unit adapter (schema fixture + SDL inválido + sin-roots + límites) + ataque si aplica; `graphql-pack.test.ts` (true+false por regla + conteo); e2e `analyze schema.graphql` (exit codes, score/grade presentes, determinismo doble corrida); fixtures `fixtures/graphql/*.graphql`; boundary (graphql puro: extender `llm-boundary.test.ts` o equivalente — ni fs ni net ni fetch); INV-1/2/7 verdes.
- Docs: README (comando/flag si aplica — no hay flags nuevos; línea en formatos soportados), índices.

### Out

- gRPC/proto, AsyncAPI, webhooks, SOAP (M8.7+ según umbrella, uno por vez).
- Introspection JSON como input (solo SDL en slice 1; documentar).
- Átomos nuevos de engine (mutations-verbo, paginación Relay/Cursor, `@oneOf`, límites de costo/complexity, introspection en prod) → backlog §7, con spec `f1-engine` cuando toque.
- MCP `analyze_spec` con SDL: verificar en implementación; si sale gratis se incluye, si pide contrato se deja fuera con nota (no bloquear slice 1).
- Telemetría, portal, auto-fix (anti-alcance SDD §9).

## 3. Contrato

```ts
// packages/graphql/src/parse.ts (puro)
import type { Spec } from "@apigovscan/core";
export interface GraphQLParseOptions {
  sourceLabel: string;
  limits?: Partial<ParseLimits>;
}
export type ParseResult = { ok: true; spec: Spec } | { ok: false; errors: ParseError[] };
// parseGraphQL(input: string | Uint8Array, opts): ParseResult
// packages/graphql/src/index.ts: export { parseGraphQL, ... }; GRAPHQL_PACKAGE id.
// packs/graphql/pack.yaml: { id: "graphql", version, strictSource: true } + rules/*.yaml con source.url.
// CLI: analyze.ts elige parser+pack por extensión (.graphql/.gql → graphql) vía PackRepository.loadProtocol.
```

## 4. Criterios de aceptación

- [ ] AC-GQL.1: `parseGraphQL` mapea Query/Mutation/Subscription (+ `extend type`) a operations con method/path/operationId según §2; descriptions y `@deprecated` preservados.
- [ ] AC-GQL.2: args → requestBody properties; retorno → Response `data` con schema; directivas custom → 1 warning agregado.
- [ ] AC-GQL.3: SDL inválido → `ok:false` con línea; >10 MB → SIZE_LIMIT; sin roots → ok con warning + 0 ops.
- [ ] AC-GQL.4: pack `graphql` carga (`strictSource`), N reglas (N≥8, sincerado en cierre), true+false por regla, cero errores en fixtures propias.
- [ ] AC-GQL.5: `analyze schema.graphql` e2e: exit codes iguales que OpenAPI, score/grade en reporte, doble corrida byte-idéntica.
- [ ] AC-GQL.6: discovery encuentra `schema.graphql` anidado; no reclama `*.graphql` genéricos.
- [ ] AC-GQL.7: INV-1 (ni fetch ni net en `packages/graphql`), INV-2 (determinismo), INV-7 (FS solo outputs) verdes; boundary test extendido.
- [ ] AC-GQL.8: `pnpm check` verde; spec `cerrada` + índices.

## 5. Test plan

Unit adapter + pack + e2e CLI + boundary + invariantes (patrón umbrella §5; stub LLM no aplica — no hay LLM).

## 6. Dependencias

- `graphql` (graphql-js, MIT, **zero dependencies**): el parser SDL de referencia; se usa solo `parse`/`Kind` (nada de ejecución ni red). Alternativa descartada: parser SDL propio (semanas de edge cases: `extend`, interfaces, unions, directives, descriptions multilínea). `ignore-scripts` según AGENTS §8.
- `f8-*` cerrados como base (analyze-setup, loaders, pack-fs, score). Sin cambios de contrato ajeno.

## 7. Riesgos y decisiones abiertas

| Tema                                                                                         | Decisión v1                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reglas GraphQL que piden átomos nuevos (verbo en mutations, Relay pagination, cost analysis) | Fuera de M8.6; backlog para milestone con spec `f1-engine`. Calidad sobre conteo (doctrina M8.5).                                                      |
| Introspection JSON                                                                           | Fuera slice 1; SDL es lo que se commitea y audita.                                                                                                     |
| Fragments de cliente en repos                                                                | Discovery solo por nombre `schema.*`; parse sin roots = warning, no error.                                                                             |
| `method` no-HTTP en engine                                                                   | Atoms HTTP (`responsePresent 200` etc.) simplemente no disparan en specs GraphQL; el pack graphql solo usa átomos con semántica válida en el mapeo §2. |

## Changelog

- 2026-09-27 · Spec creado en `ready` (M8.6, protocolo 1 de 4; handoff vía AGENTS.md + este spec).
- 2026-09-27 · Cerrada con 8 reglas (sincerado de ~15: GQL-009 sensibles y GQL-008 enums caídos — átomos HTTP-bound; refs en formato `#/components/schemas/` tras hallazgo con `deepResolve`). Pack `graphql` + adapter + CLI por extensión + MCP gratis + discovery `schema.*`. Fixture baseline 4 findings. `pnpm check` verde.
