# f8-grpc · Soporte proto/gRPC en el plano de governance (M8.7, protocolo 2)

| Campo     | Valor                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                          |
| Fecha     | 2026-09-27                                                                                                       |
| Fase      | 8 (M8.7 del umbrella `f8-oss-differentials`: GraphQL ✓ → gRPC → AsyncAPI → webhooks)                             |
| Deriva de | `f8-oss-differentials` M8.7; `f8-graphql` (patrón adapter + pack + CLI por extensión); `f1-engine` (sin cambios) |

## 1. Objetivo / user story

Como responsable de plataforma con microservicios gRPC quiero `apigovscan analyze pet.proto` con el mismo motor, score y formatos que REST y GraphQL. Sin LLM, sin red, sin cambiar el engine, **sin dependencia nueva** (parser propio — la gramática útil es chica; `protobufjs` trae runtime de ejecución que no necesitamos).

**Regla de oro:** igual que M8.6 — adapter + pack. Lo que pida átomos nuevos queda fuera (doctrina M8.5/M8.6).

## 2. Alcance

### In

- **`packages/grpc`** (nuevo, puro: sin `node:fs`, sin net, sin fetch, **cero deps**): `parseProto(text|bytes, opts)` → `Spec`. Tokenizer + recursive descent propios para el subset útil: `syntax`, `package`, `import` (se ignora), `message` (anidados, `repeated`, `map<K,V>`, `oneof`, `reserved`, `option`), `enum`, `service`/`rpc` (streaming), `option`, `extend` (se ignora). Comentarios `//` precedentes → `description` (convención protoc). `option deprecated = true` → `deprecated: true`. Agregados `[...]`/`{...}` en options se saltean balanceados (tolerancia, nunca crash).
- **Mapeo proto → `Spec`:**
  - Cada `rpc` = una `Operation`: `method` = `rpc`, `path` = `/paquete.Servicio/Metodo` (la ruta canónica gRPC sobre HTTP/2; sin package → `/Servicio/Metodo`), `operationId` = `Servicio.Metodo`, `jsonPointer` `#/Servicio/Metodo`.
  - Request message → `requestBody` (`properties` por field, `required`: proto3 no tiene required → se omite salvo `optional`? no: proto3 fields son opcionales por diseño → `required` ausente siempre; honesto y documentado).
  - Response message → `Response` sintética `status: "data"` (misma convención que GraphQL).
  - Tipos: escalares → primitivas (`int*`→integer, `float/double`→number, `bool`→boolean, `string/bytes`→string); `repeated` → array; `map` → object; messages/enums → `ref: #/components/schemas/Nombre.Calificado` (+ `schemaNodes` con propiedades un nivel, como M8.6).
  - Streaming → `extensions["x-grpc-streaming"]` = `client|server|bidi` (dato para reglas futuras, sin reglas slice 1).
  - Sin `service` → `ok: true` con 0 operations + warning `proto-no-services` (los archivos de solo-messages/imports no rompen gates).
  - Sintaxis inválida → `ok: false` con línea. Mismo `DEFAULT_LIMITS` (10 MB). Refs a tipos no declarados (imports) → dangling seguro (`deepResolve` devuelve el nodo) + **un** warning agregado `proto-unresolved-refs`.
- **`packs/grpc`** (nuevo, `strictSource: true`): **7 reglas** con átomos existentes (Google AIPs aip.dev, Buf style guide): Servicio.Metodo PascalCase.PascalCase (`operationIdPattern`), fields snake_case (`propertyNamingViolation`), descripciones (`missingField`, `descriptionMinLength`, TODO-markers), métodos estándar Get/List/Create/Update/Delete preferidos (info, `not: operationIdPattern`), `package` declarado (warning, `not: pathMatches '^/[a-z0-9]'`).
- **CLI**: `.proto` → `parseProto` + pack `grpc` (extender el routing de `analyze.ts`); discovery `**/*.proto`; `copy-packs` + `lookupRules` + `rules explain` para el tercer pack (generalizar helper a lista de packs de protocolo).
- **Tests**: unit parser (servicio válido + inválido + sin-services + streaming + comentarios) + `grpc-pack.test.ts` (true+false + conteo) + e2e analyze (exit codes, determinismo, discovery, explain) + MCP `analyze_spec` gratis + boundary pureza; fixtures `fixtures/grpc/`; INV-1/2/7.
- Docs: README (fila analyze ya dice GraphQL — sumar proto), índices.

### Out

- gRPC transcoding/HTTP annotations (`google.api.http`) como paths REST — no en slice 1 (se ignoran como option custom).
- Reglas que piden átomos nuevos: `{Method}Request/Response` (AIP-121), field numbers nunca reutilizados (requiere diff cross-versión → drift futuro), paginación `page_token`/`page_size` (AIP-158), `etag`/`update_mask`, linter de imports/buf-breaking → backlog §7.
- AsyncAPI, webhooks, SOAP (M8.8+ según umbrella).
- Ejecución/reflection contra servidores live (anti-alcance: análisis estático).

## 3. Contrato

```ts
// packages/grpc/src/parse.ts (puro, cero deps)
export function parseProto(input: string | Uint8Array, opts: ParseOptions): ParseResult; // = { ok:true; spec } | { ok:false; errors }
// packages/grpc/src/index.ts: GRAPHQL_PACKAGE→GRPC_PACKAGE id.
// packs/grpc/pack.yaml: { id: "grpc", version, strictSource: true }.
// CLI: isGrpcInput (.proto) en analyze.ts; discovery **/*.proto; copy-packs ["elite","graphql","grpc"].
```

## 4. Criterios de aceptación

- [ ] AC-GR.1: services/rpcs (incl. `stream`, nested, `oneof`, `map`, `extend` tolerado) → operations con method/path/operationId según §2; comentarios → descriptions; `deprecated` preservado.
- [ ] AC-GR.2: request → requestBody properties; response → `data`; tipos mapeados + refs con formato `#/components/schemas/`; streaming en extensions.
- [ ] AC-GR.3: proto inválido → `ok:false` con línea; >10 MB → SIZE_LIMIT; sin services → ok + warning; tipos importados → warning agregado, sin crash.
- [ ] AC-GR.4: pack `grpc` carga (`strictSource`), 7 reglas, true+false por regla, cero errores en fixtures propias.
- [ ] AC-GR.5: `analyze pet.proto` e2e (exit codes, score/grade, determinismo byte-hash); `rules explain GRPC-*`; discovery `**/*.proto`.
- [ ] AC-GR.6: MCP `analyze_spec` con `.proto` gratis; boundary pureza extendido; INV-1/2/7.
- [ ] AC-GR.7: `pnpm check` verde; spec `cerrada` + índices.

## 5. Test plan

Unit parser + pack + e2e CLI + MCP + boundary + invariantes (patrón M8.6).

## 6. Dependencias

- Ninguna nueva (parser propio justificado: gramática útil chica; `protobufjs` = runtime pesado innecesario). `f8-graphql` como plantilla.

## 7. Riesgos y decisiones abiertas

| Tema                                             | Decisión v1                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| proto2 (`required`, groups, `extend` con campos) | Tolerar/saltear; slice 1 manda proto3 moderno.                                          |
| `google.api.http` annotations                    | Se ignoran (option custom); transcoding como fuente REST = milestone aparte si se pide. |
| Field numbers / breaking                         | Requiere diff cross-versión → futuro sobre `drift`, no reglas snapshot.                 |
| Reglas AIP finas (121/158/etag)                  | Backlog con átomos nuevos, doctrina M8.5.                                               |

## Changelog

- 2026-09-27 · Spec creado en `ready` (M8.7, protocolo 2 de 4; handoff vía AGENTS.md + este spec).
- 2026-09-27 · Cerrada con 7 reglas: parser propio total (tokenizer + recursive descent, comentarios → descriptions, options agregadas toleradas), refs `#/components/schemas/`, streaming en extensions. Fixture baseline 10 findings. `pnpm check` verde.
