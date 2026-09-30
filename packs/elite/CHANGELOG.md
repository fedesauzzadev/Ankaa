# Changelog · elite pack

Formato: CalVer `YYYY.MM.PATCH`. Breaking = quitar regla o cambiar severidad default de error↔otro.

## 2026.09.5 · unreleased

- M8.6-A (`f8-elite-100`): higiene de contrato, **4 reglas nuevas** (94 activas en total). 3 átomos DSL nuevos (spec primero, `f1-engine` AC-E.15): `unusedComponents` (doc, solo schemas v1), `undefinedOAuthScopes` (operation, scopes del requirement vs flows; requiere `SecuritySchemeDef.scopes` del parser), `ambiguousPaths` (doc, colisión de templates por método).
- Nuevas: STRUCT-008 (schemas sin usar), SEC-004 (scopes OAuth indefinidos, RFC 6749; `sources.yaml` += `rfc6749`), NAMING-012 (templates que colisionan), DOCS-009 (placeholders example.com, mismo patrón que DOCS-007). Todas con `examples` (AC-E.13).
- Fuera de v1 (documentado, sin átomo honesto barato): ejemplos-vs-schema (requiere mini-validador), enums duplicados cross-schema (ruido, no breakage), servers con example.com (sin átomo de URL).
- Ruido medido: cero findings nuevos en los 4 fixtures (mini 14 = 0/6/8; públicas 74/74); score `{74, C}` y thresholds ≤60/≤80 intactos.

## 2026.09.4 · unreleased

- M8.6-B2 (`f8-elite-100`): **2 reglas nuevas** (90 activas en total), solo con átomos DSL existentes, sin tocar `packages/core`.
- Nuevas: PAG-004 (206 sin Content-Range, RFC 9110), PERF-002 (429 sin headers RateLimit, IETF draft; `sources.yaml` += `ietf-ratelimit`). Ambas con `examples` (estándar AC-E.13).
- Dominios SEC/CONS/DEPR/VER sin cambios deliberados: los candidatos con átomos existentes duplican reglas vigentes (SEC-004≈AUTH-004, `exampleRequired` rompería thresholds, `pathHasPrefix` contradice VER-001, DEPR sin átomo de polaridad). Calidad sobre conteo.
- Ruido medido: cero findings nuevos en los 4 fixtures (mini 14 = 0/6/8; públicas 74/74); score `{74, C}` y thresholds ≤60/≤80 intactos.

## 2026.09.3 · unreleased

- M8.6 (`f8-elite-100`): `examples: {bad, good}` en 8 reglas (NAMING-001/002/004, STRUCT-002, DEPR-001, ERR-001, PARAM-004, RESP-003). Requiere core con AC-E.13 (`Rule.examples` opcional). Sin cambios de severidad ni reglas nuevas: no breaking.

## 2026.09.2 · unreleased

- M8.5 (`f8-elite-100`): segunda oleada de curación — **23 reglas nuevas** (88 activas en total), solo con átomos DSL existentes, sin tocar `packages/core`.
- Nuevas: RESP-006…016 (semántica de respuestas por método), ERR-007…009 (Retry-After/WWW-Authenticate/Proxy-Authenticate), AUTH-006 (credenciales en query), NAMING-011 (query strings en paths), PARAM-008/009 (camelCase en path/cookie), DOCS-007/008 (placeholders y longitud en descripciones), SCHEMA-006 (profundidad inline ≤ 3), STRUCT-007 (preferir 3.1), DEPR-003 (Sunset/Deprecation).
- `sources.yaml`: + RFC 8594 + OWASP API Security.
- Cobertura: `packages/cli/test/elite-100.test.ts` (true+false por regla + conteo 88 + mapa de severidades).

### Impacto por severidad (fixtures committeados, sin red)

Conteo de findings con el pack completo sobre fixtures oficiales:

| Fixture                                                         | total | error | warning | info |
| --------------------------------------------------------------- | ----: | ----: | ------: | ---: |
| `fixtures/petstore-mini.yaml`                                   |    14 |     0 |       6 |    8 |
| `fixtures/petstore-mini.json`                                   |    14 |     0 |       6 |    8 |
| `fixtures/public/petstore3.json` (petstore3.swagger.io)         |    74 |    18 |      38 |   18 |
| `fixtures/public/petstore2.yaml` (swagger-api/swagger-petstore) |    74 |    18 |      38 |   18 |

Cero findings nuevos sobre `petstore-mini.*` (score congelado `{74, C}` intacto); cero errores nuevos en fixtures públicas; thresholds ≤ 60 / ≤ 80 intactos.

## 2026.09.1 · unreleased

- Skeleton M1.3: primer lote de reglas de alto valor (estructura, naming, docs, respuestas, errores, parámetros, auth, seguridad).
- Full M1.5: inventario completo del spec `f1-elite-pack` — **65 reglas activas** en 13 archivos bajo `rules/`.
- Nuevas categorías/carga: `pagination`, `versioning`, `deprecation`, `consistency`, `performance` + saturación de `schemas`/`responses`/`auth`/`security`.
- Todas las reglas citan `source.url` (`strictSource: true`).
- `explain(ruleId)` / `apigovscan rules explain <id>` para mensaje + fuente + url.

### Impacto por severidad (fixtures committeados, sin red)

Conteo de findings con el pack completo sobre fixtures oficiales:

| Fixture                                                         | total | error | warning | info |
| --------------------------------------------------------------- | ----: | ----: | ------: | ---: |
| `fixtures/petstore-mini.yaml`                                   |    14 |     0 |       6 |    8 |
| `fixtures/petstore-mini.json`                                   |    14 |     0 |       6 |    8 |
| `fixtures/public/petstore3.json` (petstore3.swagger.io)         |    61 |    18 |      26 |   17 |
| `fixtures/public/petstore2.yaml` (swagger-api/swagger-petstore) |    61 |    18 |      26 |   17 |

Thresholds de ruido en tests (`packages/cli/test/elite-pack.test.ts`):

- petstore-mini.*: ≤ 60 findings
- public/petstore3.json, public/petstore2.yaml: ≤ 80 findings

Performance NFR-02 (medido en este milestone): spec sintético ~1.0 MB (200 ops) → **p50 ≈ 1.1–1.4 s**, p95 < 2 s (Node 24 local). Spec sintético denso (4500 ops / 1 MB) ≈ 16 s — documentado como caso extremo no cubierto por el gate de 1 MB / 2 s.
