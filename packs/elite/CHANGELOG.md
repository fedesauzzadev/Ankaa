# Changelog · elite pack

Formato: CalVer `YYYY.MM.PATCH`. Breaking = quitar regla o cambiar severidad default de error↔otro.

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
