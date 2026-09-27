# f8-asyncapi · Soporte AsyncAPI/eventos en el plano de governance (M8.8, protocolo 3)

| Campo | Valor |
|---|---|
| Estado | cerrada |
| Fecha | 2026-09-27 |
| Fase | 8 (M8.8 del umbrella `f8-oss-differentials`: GraphQL ✓ → gRPC ✓ → AsyncAPI → webhooks) |
| Deriva de | `f8-oss-differentials` M8.8; `f8-graphql`/`f8-grpc` (patrón adapter + pack + CLI); `f1-engine` (sin cambios) |

## 1. Objetivo / user story

Como responsable de plataforma con arquitectura orientada a eventos quiero `apigovscan analyze asyncapi.yaml` con el mismo motor, score y formatos que REST, GraphQL y gRPC. Sin LLM, sin red, sin cambiar el engine, **sin dependencia nueva** (AsyncAPI es YAML/JSON — se parsea con el paquete `yaml` ya usado en `openapi`).

**Regla de oro:** adapter + pack, doctrina M8.5 (lo que pida átomos nuevos queda fuera).

## 2. Alcance

### In

- **`packages/asyncapi`** (nuevo, puro: sin `node:fs`, sin net, sin fetch; dep `yaml` existente): `parseAsyncAPI(text|bytes, opts)` → `Spec`. Soporta **v2.x y v3.x** (subset documentado): v2 `channels.{publish,subscribe}` + `components.messages/schemas`; v3 `operations.{send,receive}` + `channels` + `components`. `$ref` solo locales (`#/components/...`); remotos → error honesto (INV-1, igual que `openapi`).
- **Mapeo AsyncAPI → `Spec`:**
  - Cada operación de canal = una `Operation`: `method` = `publish|subscribe` (v2) o `send|receive` (v3); `path` = `/` + nombre de canal (parámetros `{userId}` se conservan); `operationId` = v2 `operationId` o clave de operación v3; `jsonPointer` análogo.
  - Payload del mensaje → `requestBody` (publish/send) o Response `data` (subscribe/receive, misma convención M8.6/M8.7). `message.oneOf` / lista v3 → **primer** mensaje (simplificación documentada slice 1).
  - Headers del mensaje → `parameters` con `in: "header"`. Parámetros de canal → `parameters` con `in: "path"`.
  - Payloads JSON Schema → `SchemaNode` (type/properties/items/enum/required/`$ref` local); messages/components registrados en `schemaNodes`, refs `#/components/schemas/`.
  - `servers` → `servers[]` (url + protocol en description; sin reglas slice 1).
  - Sin operaciones → `ok: true` + warning `asyncapi-no-operations`. Versión no soportada (ni 2.x ni 3.x) → `ok: false`. Mismo `DEFAULT_LIMITS`.
- **`looksLikeAsyncApi(bytes)`** (puro, en el mismo package): sniff `asyncapi:` en raíz (YAML o JSON, primeros 4 KB). El routing CLI lo usa porque AsyncAPI comparte extensiones con OpenAPI.
- **`packs/asyncapi`** (nuevo, `strictSource: true`): **6 reglas** con átomos existentes (AsyncAPI docs, CloudEvents): canales minúsculas (`not: pathMatches '^/[a-z0-9]'`), `operationId` requerido, descripciones (missing + ≥20 + TODO), payload props camelCase (`propertyNamingViolation`).
- **CLI**: routing por **sniff** para `.yaml/.yml/.json`/`-` (asyncapi → `parseAsyncAPI` + pack `asyncapi`); discovery `asyncapi.{yaml,yml,json}` + `**/asyncapi.{yaml,yml,json}`; `copy-packs` + `lookupRules` + `rules explain` (agregar a `PROTOCOL_PACKS`).
- **Tests**: unit parser (v2 + v3 + inválido + sin-ops + $ref roto) + `asyncapi-pack.test.ts` + e2e + MCP gratis + boundary; fixtures `fixtures/asyncapi/`; INV-1/2/7.
- Docs: README (sumar AsyncAPI) + índices.

### Out

- Bindings por protocolo (kafka/mqtt/ws valves) como reglas — datos presentes, reglas futuras.
- Pairing publish↔subscribe, versionado de eventos, compatibilidad de schemas (registry), CloudEvents binding validation → backlog §7 (piden átomos nuevos o diff cross-versión).
- Webhooks/HTTP callbacks (M8.9 según umbrella).
- `servers` sin TLS como regla (el átomo `serverInsecure` es HTTP-only; no forzar).

## 3. Contrato

```ts
// packages/asyncapi/src/parse.ts (puro, dep yaml)
export function looksLikeAsyncApi(input: Uint8Array | string): boolean;
export function parseAsyncAPI(input: Uint8Array | string, opts: ParseOptions): ParseResult;
// packs/asyncapi/pack.yaml: { id: "asyncapi", version, strictSource: true }.
// CLI: sniff en analyze.ts para yaml/json/stdin; discovery asyncapi.*; PROTOCOL_PACKS + "asyncapi".
```

## 4. Criterios de aceptación

- [ ] AC-AS.1: v2 publish/subscribe y v3 send/receive → operations con method/path/operationId; descriptions, tags y externalDocs preservados.
- [ ] AC-AS.2: payload → requestBody/data según dirección; headers → parameters header; channel params → parameters path; `$ref` locales resueltos, remotos error honesto.
- [ ] AC-AS.3: versión inválida → `ok:false`; >10 MB → SIZE_LIMIT; sin operaciones → ok + warning.
- [ ] AC-AS.4: pack `asyncapi` carga (`strictSource`), 6 reglas, true+false por regla, cero errores en fixtures propias.
- [ ] AC-AS.5: `analyze asyncapi.yaml` e2e (el sniff no debe robarle ni un `.yaml` OpenAPI: regresión suite intacta); determinismo; `rules explain ASYNC-*`; discovery.
- [ ] AC-AS.6: MCP gratis; boundary pureza; INV-1/2/7.
- [ ] AC-AS.7: `pnpm check` verde; spec `cerrada` + índices.

## 5. Test plan

Unit parser (v2+v3) + pack + e2e CLI + MCP + boundary + invariantes. Ojo AC-AS.5: test explícito de que un OpenAPI `.yaml` NO se clasifica como AsyncAPI.

## 6. Dependencias

- Ninguna nueva (`yaml` ya es dep de `openapi`; se declara en `packages/asyncapi`). `f8-grpc` como plantilla.

## 7. Riesgos y decisiones abiertas

| Tema | Decisión v1 |
|---|---|
| v2 vs v3 | Ambos slice 1 (v3 nace obsoleto sin v2 legacy y viceversa); subset documentado, resto warning o error honesto. |
| `oneOf` / múltiples mensajes | Primer mensaje; documentado. Full-union = milestone con átomos. |
| Sniff falso positivo | Regex anclada a raíz `asyncapi:` en primeros 4 KB; test de regresión OpenAPI. |
| CloudEvents como formato | Fuente de guidance, no parser aparte (los payloads CE son JSON Schema normal). |

## Changelog

- 2026-09-27 · Spec creado en `ready` (M8.8, protocolo 3 de 4; handoff vía AGENTS.md + este spec).
- 2026-09-27 · Cerrada con 6 reglas: parser v2+v3 con `yaml` existente (payload→body/data según dirección, headers→parameters, $ref locales, servers v2+v3), sniff conservador con regresión OpenAPI, refs `#/components/schemas/`. Fixture v2 baseline 3 findings, v3 limpio. `pnpm check` verde.
