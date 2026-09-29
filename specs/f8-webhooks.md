# f8-webhooks · Soporte webhooks/HTTP callbacks en el plano de governance (M8.9, protocolo 4)

| Campo     | Valor                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                       |
| Fecha     | 2026-09-27                                                                                                    |
| Fase      | 8 (M8.9 del umbrella `f8-oss-differentials`: GraphQL ✓ → gRPC ✓ → AsyncAPI ✓ → webhooks)                      |
| Deriva de | `f8-oss-differentials` M8.6; `f8-asyncapi` (patrón adapter + pack + CLI por sniff); `f1-engine` (sin cambios) |

## 1. Objetivo / user story

Como responsable de plataforma con webhooks salientes quiero `apigovscan analyze webhooks.yaml` con el mismo motor, score y formatos que REST, GraphQL, gRPC y AsyncAPI. Sin LLM, sin red, sin cambiar el engine, **sin dependencia nueva** (la definición de webhooks es YAML/JSON — se parsea con el paquete `yaml` ya usado en `openapi`/`asyncapi`).

**Regla de oro:** adapter + pack, doctrina M8.5 (lo que pida átomos nuevos queda fuera).

## 2. Alcance

### In

- **`packages/webhooks`** (nuevo, puro: sin `node:fs`, sin net, sin fetch; dep `yaml` existente): `parseWebhooks(text|bytes, opts)` → `Spec`. Formato de entrada (YAML o JSON):
  ```yaml
  version: "1"
  info: { title: "Billing webhooks", version: "1.4.0" }
  webhooks:
    user.created:
      description: "Fires when a user signs up, after email verification."
      payload: { type: object, properties: { userId: { type: string } }, required: [userId] }
      headers:
        - { name: webhook-signature, required: true }
  ```
  - `webhooks` es un mapa `event.type → definición` (`description`/`summary`, `payload` JSON Schema, `headers[]` con `name`/`required`/`description`, `deprecated`). Sin `webhooks` o mapa vacío → `ok: true` + warning `webhooks-no-events`. Raíz no-objeto o `webhooks` no-objeto → `ok: false`.
  - `$ref` solo locales (`#/...`); remotos → error honesto `REMOTE_REF` (INV-1, igual que `openapi`/`asyncapi`).
- **Mapeo webhooks → `Spec`:**
  - Cada event type = una `Operation`: `method` = `post` (Standard Webhooks: el payload viaja en el body de un HTTP POST); `path` = `/` + type con `.` → `/` (`user.created` → `/user/created`); `operationId` = event type original con puntos; `jsonPointer` = `#/webhooks/<type>`.
  - `payload` JSON Schema → `requestBody` (`required: true`, `content[0]` = `application/json`) + registro en `schemaNodes`, refs `#/components/schemas/`.
  - `headers` declarados → `parameters` con `in: "header"` (el parser **no** inyecta headers: `headerRequired` debe poder fallar si el autor no los declara).
  - `Response` sintética `status: "200"` (`Webhook receipt acknowledgement (2xx semantics)`, sin content: los acks suelen ir vacíos; ninguna regla del pack slice 1 inspecciona contenido de respuesta).
  - `servers` → `servers[]` (sin reglas slice 1). `deprecated` preservado. `info.title/version/description` preservados.
  - Mismo `DEFAULT_LIMITS` (10 MB → `SIZE_LIMIT`).
- **`looksLikeWebhooks(bytes)`** (puro, en el mismo package): sniff `webhooks:` top-level (YAML o JSON, primeros 4 KB) **y** ausencia de `openapi:`/`swagger:`/`asyncapi:` en la misma ventana. El routing CLI lo usa porque los archivos de webhooks comparten extensiones con OpenAPI/AsyncAPI.
- **`packs/webhooks`** (nuevo, `strictSource: true`): **6 reglas** con átomos existentes (Standard Webhooks spec):
  - `WH-001` naming: event type en minúsculas punto-delimitado (`not: operationIdPattern '^[a-z0-9_]+[.][a-z0-9_.]*$'` — sin cuantificador anidado por `validateRule`), warning. Fuente: spec §Event types.
  - `WH-002` docs: el evento debe documentar `description` (`missingField`), warning. Fuente: spec §Payload structure (ejemplos + schema formal por event type).
  - `WH-003` docs: `description` ≥ 20 caracteres (`not: descriptionMinLength`), info.
  - `WH-004` docs: sin placeholders TODO/FIXME (`descriptionMatches`), info.
  - `WH-005` security: el evento debe declarar el header `webhook-signature` (`headerRequired`), warning. Fuente: spec §Webhook headers + §Verifying webhook authenticity.
  - `WH-006` structure: el evento debe llevar payload en el body (`presentField: requestBody`), warning. Fuente: spec §Payload (el payload viaja en el HTTP body).
- **CLI**: routing por **sniff** para `.yaml/.yml/.json`/`-` (webhooks → `parseWebhooks` + pack `webhooks`); el sniff AsyncAPI/OpenAPI conserva prioridad ante la duda (ante `openapi:`+`webhooks:` manda OpenAPI, ver §7); discovery `webhooks.{yaml,yml,json}` + `**/webhooks.{yaml,yml,json}`; `copy-packs` + `lookupRules` + `rules explain` (agregar a `PROTOCOL_PACKS` y a `knownIds` en `analyze-setup.ts`).
- **Tests**: unit parser (válido + inválido + sin-events + $ref roto) + `webhooks-pack.test.ts` + e2e + MCP gratis + boundary; fixtures `fixtures/webhooks/`; INV-1/2/7. Ojo: test explícito de que un OpenAPI 3.1 con sección `webhooks:` NO se clasifica como webhooks (sigue parser OpenAPI).
- Docs: README (sumar webhooks) + índices.

### Out

- Verificación de firmas HMAC / tolerancia de `webhook-timestamp` / anti-replay: runtime de envío/recepción, no análisis estático.
- Retry schedule, backoff/jitter, manejo de `429`/`retry-after`, `410 Gone` como desuscripción: comportamiento operacional, no chequeable en una definición.
- `servers` sin TLS como regla (el átomo `serverInsecure` es HTTP-only; no forzar — misma nota que M8.8).
- Thin-vs-full payloads, SSRF, idempotencia cross-delivery: piden átomos nuevos o análisis de código → backlog §7.
- Sección `webhooks:` nativa de OpenAPI 3.1 dentro de un spec OpenAPI (sigue parser `openapi`; el adapter slice 1 cubre archivos standalone).
- SOAP/WSDL: solo detección + aviso (borde del umbrella, no producto).

## 3. Contrato

```ts
// packages/webhooks/src/parse.ts (puro, dep yaml)
export function looksLikeWebhooks(input: Uint8Array | string): boolean;
export function parseWebhooks(input: Uint8Array | string, opts: ParseOptions): ParseResult;
// packs/webhooks/pack.yaml: { id: "webhooks", version, strictSource: true }.
// CLI: sniff en analyze.ts para yaml/json/stdin; discovery webhooks.*; PROTOCOL_PACKS + "webhooks".
```

## 4. Criterios de aceptación

- [ ] AC-WH.1: eventos (`user.created`, anidados `invoice.paid.v2`) → operations con method `post`, path con slashes, operationId con puntos; descriptions y `deprecated` preservados.
- [ ] AC-WH.2: payload → requestBody `application/json` + schemaNodes con refs `#/components/schemas/`; headers → parameters header; `$ref` locales resueltos, remotos error honesto.
- [ ] AC-WH.3: raíz/`webhooks` inválidos → `ok:false`; >10 MB → SIZE_LIMIT; sin eventos → ok + warning `webhooks-no-events`.
- [ ] AC-WH.4: pack `webhooks` carga (`strictSource`), 6 reglas, true+false por regla, cero errores en fixtures propias.
- [ ] AC-WH.5: `analyze webhooks.yaml` e2e (el sniff no debe robarle ni un `.yaml` OpenAPI —incl. OpenAPI 3.1 con `webhooks:`— ni un AsyncAPI: regresión suites intactas); determinismo; `rules explain WH-*`; discovery.
- [ ] AC-WH.6: MCP gratis; boundary pureza; INV-1/2/7.
- [ ] AC-WH.7: `pnpm check` verde; spec `cerrada` + índices.

## 5. Test plan

Unit parser (válido + inválido + sin-events + $ref roto + sniff) + pack + e2e CLI + MCP + boundary + invariantes. Ojo AC-WH.5: tests explícitos de que OpenAPI (.yaml con `openapi:`, incl. 3.1 con `webhooks:`) y AsyncAPI NO se clasifican como webhooks.

## 6. Dependencias

- Ninguna nueva (`yaml` ya es dep de `openapi`/`asyncapi`; se declara en `packages/webhooks`). `f8-asyncapi` como plantilla (sniff + pack + CLI).

## 7. Riesgos y decisiones abiertas

| Tema                                                         | Decisión v1                                                                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sniff falso positivo (OpenAPI 3.1 trae `webhooks:` nativo)   | `looksLikeWebhooks` exige ausencia de `openapi:`/`swagger:`/`asyncapi:` en los primeros 4 KB; ante la duda, OpenAPI (comportamiento actual). Test de regresión con fixture OpenAPI 3.1 + `webhooks:`. |
| Colisión de paths (`a.b` vs `a/b` si alguien ya usa slashes) | El `path` es derivado para reutilizar átomos REST; la identidad del finding usa `jsonPointer` (`#/webhooks/<type>`), que conserva el type original: no colapsan findings. Documentado.                |
| Payloads no-JSON (binarios)                                  | `content[0]` se declara `application/json` solo si el schema es objeto/array; si no, schema opaco y las reglas de schema no disparan. Documentado slice 1.                                            |
| `WH-005` sin firmas reales                                   | La regla chequea contrato declarado (el header existe en la definición), no criptografía. Verificación HMAC = runtime, fuera de alcance.                                                              |
| Cierre del umbrella                                          | M8.9 es el protocolo 4 de 4: al cerrarla, `f8-oss-differentials` M8.6 queda completo (resta SOAP-borde, que es solo detección).                                                                       |

## Changelog

- 2026-09-27 · Spec creado en `ready` (M8.9, protocolo 4 de 4; handoff vía AGENTS.md + este spec).
- 2026-09-28 · WH-001: patrón sin cuantificador anidado (`^[a-z0-9_]+[.][a-z0-9_.]*$`) para pasar `validateRule` (misma intención, sin `(...)+`).
- 2026-09-28 · M8.9 implementado → `cerrada` (AC-WH.1–7 verdes; `pnpm check` verde; umbrella M8.6 completo: GraphQL → gRPC → AsyncAPI → webhooks).
