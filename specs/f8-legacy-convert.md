# f8-legacy-convert · Swagger 1.x/2.0 → Spec best-effort (legacy REST)

| Campo     | Valor                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                            |
| Fecha     | 2026-09-28                                                                         |
| Fase      | 8 (diferencial legacy REST)                                                        |
| Deriva de | `f1-openapi` AC-O.12 (hoy error `SWAGGER_20`); SDD ADR-002; `f8-oss-differentials` |

## 1. Objetivo / user story

Como equipo con APIs legacy en Swagger 1.2 o 2.0 quiero `apigovscan analyze swagger.yaml` con el mismo motor, score y formatos que OpenAPI 3.x, sin convertir a mano. Conversión **best-effort advertida**: lo que no mapea se pierde con warning, nunca con silencio.

**Regla de oro:** adapter, sin engine nuevo, sin red, sin deps nuevas (el legacy es YAML/JSON — se parsea con `yaml` ya usado en `openapi`).

## 2. Alcance

### In

- **Detección** en `@apigovscan/openapi` (puro, sin `node:fs`/net/fetch):
  - Swagger 2.0: raíz con `swagger: "2.0"` string.
  - Swagger 1.x: raíz con `swaggerVersion: "1.1"|"1.2"` + `apis[]` (sin `openapi` ni `swagger: "2.0"`).
- **`parseSpec` acepta legacy** y devuelve `Spec` con `openapiVersion: "3.0.0-converted"` y warning `SWAGGER_CONVERTED` (mensaje con versión origen + pérdidas si hubo). Mantiene `inputHash` de bytes crudos, `sourceLabel`, `DEFAULT_LIMITS` (10 MB → `SIZE_LIMIT`), UTF-8 estricto, `$ref` solo locales (remotos → `REF_REMOTE_FORBIDDEN`, igual que 3.x).
- **Mapeo Swagger 2.0 → `Spec`:**
  - `info.title/version/description` preservados; `basePath` + `host`/`schemes` → `servers[]` best-effort (si no hay, se omite).
  - `paths.<path>.<method>` → `Operation` (`method` lower, `path` tal cual, `operationId/summary/description/tags/deprecated` preservados, `jsonPointer` original).
  - Parámetros: `in: path|query|header|cookie` directos; `in: body` + `schema` → `requestBody` (`required` del parámetro, `application/json`); `in: formData` → se dropea con pérdida registrada (no hay equivalente cuerpo en `Spec` slice 1).
  - `responses.<status>` → `Response` (`description`, `schema` → `content[0] application/json`, `headers[]` como nombres).
  - `definitions` → `schemaNodes` + `schemas[]`; `parameters`/`responses` globales con `$ref: '#/parameters/...'` resueltos inline best-effort; `securityDefinitions` + `security` global/por-op preservados si mapean a `SecurityRequirement`, si no se dropean con pérdida.
- **Mapeo Swagger 1.2 → `Spec`:**
  - `apis[].path` + `operations[]`: `method` lower, `nickname` → `operationId`, `summary` → `summary`, `notes` → `description`, `deprecated` (`"true"` o `true`) → `deprecated`.
  - Parámetros: `paramType: path|query|header|cookie` directos; `paramType: body` → `requestBody`; `paramType: form` → dropeado con pérdida.
  - `responseMessages[]` → `Response` (`code` → `status` string, `message` → `description`, `responseModel` → `content schema ref`).
  - `models` → `schemaNodes` (`id` o key como nombre; `properties`/`required`).
  - `basePath` → `servers[]` si existe.
- **Pérdidas advertidas** (no silenciosas): se acumulan en el warning `SWAGGER_CONVERTED` como detalle (`dropped: formData, collectionFormat:csv, ...`) con tope de longitud para no romper determinismo.
- **CLI**: sin cambios de routing (sigue `parseSpec`); `discovery` suma `swagger.{yaml,yml,json}` + `**/swagger.{yaml,yml,json}`; mensajes de error legacy anteriores (`SWAGGER_20`) se retiran.
- **Tests**: unit (2.0 mínimo + 1.2 mínimo + pérdidas + $ref remoto + inválido) + e2e (`analyze swagger2-minimal.yaml` hoy fixture existe, más `swagger1-minimal.yaml` nuevo) + regresión 3.x intacta; INV-1/2/7.
- Docs: README (sumar legacy) + índices.

### Out

- Conversión 100% fiel (imposible: `collectionFormat`, `discriminator` 2.0, `allowMultiple`, `authorizations` 1.x no tienen equivalente exacto → se documentan como pérdida).
- Validación exhaustiva del legacy (solo estructura para reglas + errores honestos).
- WSDL/RAML/API Blueprint (otros legacies, backlog §7).
- Escritura del archivo convertido (`--out converted.yaml` es v2, slice 1 solo analiza en memoria).

## 3. Contrato

```ts
// packages/openapi/src/parse.ts (puro, dep yaml existente)
export function parseSpec(input: Uint8Array | string, opts: ParseOptions): ParseResult;
// swagger 1.x/2.0 → ok:true + Spec { openapiVersion: "3.0.0-converted", parseWarnings: [{ code: "SWAGGER_CONVERTED", message }] }
// versión no reconocida → ok:false (MISSING_OPENAPI / UNSUPPORTED_VERSION existentes)
// CLI: discovery swagger.*; sin cambios en analyze.ts salvo mensajes.
```

## 4. Criterios de aceptación

- [ ] AC-LG.1: `fixtures/swagger2-minimal.yaml` → `ok:true`, 1 operation `get /legacy`, warning `SWAGGER_CONVERTED`; `analyze` e2e con pack `elite` (no pack nuevo).
- [ ] AC-LG.2: `fixtures/swagger1-minimal.yaml` (nuevo, 1.2 con `apis/operations/models`) → `ok:true`, `nickname`→`operationId`, `notes`→`description`, models en `schemaNodes`; determinismo (doble run mismo `reportHash`).
- [ ] AC-LG.3: pérdidas (formData, collectionFormat no-default, authorizations 1.x) → no tumban el parse; quedan listadas en el detalle del warning con tope.
- [ ] AC-LG.4: `$ref` remoto en legacy → `REF_REMOTE_FORBIDDEN`; YAML inválido / raíz no-objeto / >10 MB → errores existentes (`SYNTAX`/`NOT_AN_OBJECT`/`SIZE_LIMIT`).
- [ ] AC-LG.5: regresión 3.0/3.1 intacta (suites `openapi` + `elite` verdes, `openapiVersion` real preservada, sin warning nuevo).
- [ ] AC-LG.6: boundary pureza (openapi sigue sin `node:fs`/net/fetch salvo tipos); INV-1/2/7 verdes.
- [ ] AC-LG.7: `pnpm check` verde; spec `cerrada` + índices + README.

## 5. Test plan

Unit `packages/openapi/test/legacy.test.ts` (2.0 + 1.2 + pérdidas + remotos + límites) + e2e CLI (`swagger-analyze.e2e.test.ts`) + regresión `openapi` existente + invariantes. Fixtures nuevas: `swagger1-minimal.yaml` (+ ataque `attack/swagger-remote-ref.yaml` si falta).

## 6. Dependencias

- Ninguna nueva (`yaml` existente). `f1-openapi` como base; `f1-engine` sin cambios (el `Spec` convertido reutiliza átomos/reglas `elite`).

## 7. Riesgos y decisiones abiertas

| Tema                            | Decisión v1                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| Fidelidad                       | Best-effort + warning con pérdidas listadas; nunca error silencioso ni dato inventado.    |
| `openapiVersion` convertida     | `"3.0.0-converted"` fija (no finge 3.1); el reporte declara origen en warnings.           |
| `formData` / `collectionFormat` | Se dropean con pérdida registrada; reglas que dependan de body no disparan (documentado). |
| Swagger 1.1 vs 1.2              | Se soportan ambas con el mismo mapeo; si difieren, manda 1.2 y se advierte.               |
| WSDL/RAML                       | Fuera (backlog); solo mensaje existente `UNSUPPORTED_VERSION`.                            |

## Changelog

- 2026-09-28 · Spec creado en `draft` (handoff vía AGENTS.md + este spec).
- 2026-09-28 · Revisado por usuario → `ready` (alcance full 1.x + 2.0 aprobado).
- 2026-09-28 · M8.10 implementado → `cerrada` (AC-LG.1–7 verdes; `pnpm check` verde).
