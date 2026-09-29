# f1-elite-pack · Pack de estándares `elite` ≥ 50 reglas

| Campo     | Valor                                                          |
| --------- | -------------------------------------------------------------- |
| Estado    | implementada                                                   |
| Fase      | 1                                                              |
| Deriva de | SDD D6, FR-10/11/12, doc 04 estándares; criterio salida Fase 1 |
| Artefacto | `packs/elite/<version>/` embebido en `@apigovscan/cli`         |

## 1. Objetivo

Entregar el pack curado `elite` con **≥ 50 reglas activas**, cada una con `source` citable, calibrado contra fixtures para mantener ruido bajo (falsos positivos < umbral acordado), versionado CalVer inicial `2026.09.1`.

## 2. Alcance

### Dentro

- Estructura del pack: `pack.yaml` (meta), `rules/**/*.yaml`, `sources.yaml`, `CHANGELOG.md`.
- ≥ 50 reglas activas distribuidas en la taxonomía del SDD.
- Cálculo de severidades default según guía de calibración (doc 04 §3).
- Validación de pack en CI: schema + `source.url` presente + ids únicos + fixtures de ruido.
- Empaquetado dentro del CLI (los bytes viajan con `npx`).
- Snapshot de impacto: con fixtures oficiales, conteo por severidad documentado en CHANGELOG.

### Fuera

- Worker de sync / canales canary (f6).
- Packs `minimal`/`strict`/`org` (futuro).
- Reglas draft de usuarios (f3 skills).

## 3. Contrato

### Estructura de directorio

```
packs/elite/
├── pack.yaml
├── sources.yaml
├── CHANGELOG.md
└── rules/
    ├── structure.yaml
    ├── naming.yaml
    ├── docs.yaml
    ├── parameters.yaml
    ├── schemas.yaml
    ├── responses.yaml
    ├── errors.yaml
    ├── auth.yaml
    ├── pagination.yaml
    ├── versioning.yaml
    ├── deprecation.yaml
    ├── consistency.yaml
    └── security.yaml
```

### pack.yaml

```yaml
id: elite
version: "2026.09.1"
description: Curated pack from public API design guidelines
license: MIT # textos propios; fuentes citadas por URL
sourcesFile: sources.yaml
strictSource: true # toda regla exige source
```

### sources.yaml

```yaml
sources:
  - id: google-api-design
    title: Google API Design Guide
    url: https://cloud.google.com/apis/design
  - id: microsoft-rest
    title: Microsoft REST API Guidelines
    url: https://github.com/microsoft/api-guidelines
  - id: zalando
    title: Zalando RESTful API Guidelines
    url: https://opensource.zalando.com/restful-api-guidelines/
  - id: rfc9110
    title: RFC 9110 HTTP Semantics
    url: https://www.rfc-editor.org/rfc/rfc9110
  - id: rfc9457
    title: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
  - id: openapi-spec
    title: OpenAPI Specification
    url: https://spec.openapis.org/
  # + RFCs y guías añadidas en curación (doc 04 §2)
```

Cada regla referencia `source.url` directamente (puede duplicar URL de `sources.yaml`; el validator acepta URL conocida del archivo o inline).

### Inventario mínimo (≥ 50) — IDs comprometidos para f1

| ID         | Cat         | Sev     | Resumen (mensaje corto)                                                           | Fuente base    |
| ---------- | ----------- | ------- | --------------------------------------------------------------------------------- | -------------- |
| STRUCT-001 | structure   | error   | `openapi` field version 3.x required                                              | OpenAPI        |
| STRUCT-002 | structure   | error   | `info.title` required                                                             | OpenAPI        |
| STRUCT-003 | structure   | error   | `info.version` required                                                           | OpenAPI        |
| STRUCT-004 | structure   | warning | `servers` should be declared                                                      | OpenAPI/MS     |
| STRUCT-005 | structure   | warning | `tags` recommended when operations tagged                                         | MS             |
| STRUCT-006 | structure   | info    | Prefer `components.schemas` over deep inline roots                                | Google         |
| NAMING-001 | naming      | error   | Path segments plural nouns                                                        | Google/MS      |
| NAMING-002 | naming      | warning | No trailing slash on paths                                                        | MS             |
| NAMING-003 | naming      | warning | `operationId` unique and present                                                  | OpenAPI/MS     |
| NAMING-004 | naming      | warning | `operationId` pattern (camelCase)                                                 | MS             |
| NAMING-005 | naming      | warning | Path segments camelCase or kebab (single style)                                   | MS             |
| NAMING-006 | naming      | info    | Avoid file extensions in paths (`.json`)                                          | Google         |
| NAMING-007 | naming      | warning | Schema type names PascalCase                                                      | Google         |
| NAMING-008 | naming      | warning | Property names camelCase (JSON)                                                   | Google/MS      |
| NAMING-009 | naming      | error   | Path params `{name}` must have matching path parameter                            | OpenAPI        |
| NAMING-010 | naming      | warning | No verbs in resource paths (except RPC-style documented)                          | Google         |
| DOCS-001   | docs        | warning | `summary` present and ≥ 10 chars                                                  | MS             |
| DOCS-002   | docs        | warning | `description` present for non-trivial ops                                         | Google         |
| DOCS-003   | docs        | info    | Operation `tags` non-empty                                                        | MS             |
| DOCS-004   | docs        | warning | Every response has `description`                                                  | OpenAPI        |
| DOCS-005   | docs        | info    | Top-level `description` in info recommended                                       | Google         |
| DOCS-006   | docs        | warning | `externalDocs` optional but if used must have url                                 | OpenAPI        |
| PARAM-001  | parameters  | error   | All path template params documented                                               | OpenAPI        |
| PARAM-002  | parameters  | error   | Path params marked `required: true`                                               | OpenAPI        |
| PARAM-003  | parameters  | warning | Query param names camelCase                                                       | MS             |
| PARAM-004  | parameters  | warning | Boolean query params documented as such (type boolean)                            | Zalando        |
| PARAM-005  | parameters  | warning | Prefer `exploded` style docs for arrays                                           | Zalando        |
| PARAM-006  | parameters  | warning | No duplicate `in+name` params after merge                                         | OpenAPI        |
| PARAM-007  | parameters  | info    | Header param names canonical (lowercase) recommended                              | RFC 9110       |
| SCHEMA-001 | schemas     | warning | Reuse object schemas via `$ref` when repeated                                     | Google         |
| SCHEMA-002 | schemas     | warning | Top-level object schemas declare `properties` or `$ref`                           | OpenAPI        |
| SCHEMA-003 | schemas     | info    | Prefer `type` explicit over ambiguous empty schema                                | OpenAPI        |
| SCHEMA-004 | schemas     | warning | Enums documented with descriptions when non-obvious                               | Google         |
| SCHEMA-005 | schemas     | error   | `additionalProperties` intentional (warn true default?) → **info** default absent | OpenAPI        |
| RESP-001   | structure   | error   | Each operation documents at least one 2xx (or 3xx)                                | OpenAPI        |
| RESP-002   | structure   | warning | Collection GET documents 200 with array/page shape                                | Google         |
| RESP-003   | structure   | warning | 204 responses have no content                                                     | HTTP/MS        |
| RESP-004   | structure   | warning | Redirect statuses document Location where applicable                              | RFC 9110       |
| RESP-005   | structure   | info    | `default` response considered for unknown errors                                  | Zalando        |
| ERR-001    | errors      | warning | Write ops document ≥ 1 4xx                                                        | Zalando        |
| ERR-002    | errors      | warning | 401/403 distinction when secured                                                  | MS             |
| ERR-003    | errors      | warning | Error media type consistent across ops                                            | Zalando        |
| ERR-004    | errors      | info    | Prefer RFC 9457 `application/problem+json` for errors                             | RFC 9457       |
| ERR-005    | errors      | warning | 5xx documented for public APIs                                                    | MS             |
| ERR-006    | errors      | info    | Error body has `title` + `status`/`type` fields guidance                          | RFC 9457       |
| AUTH-001   | security    | warning | Global `security` or per-op declared for public surface                           | OpenAPI        |
| AUTH-002   | security    | warning | Ops with securitySchemes don't leave ambiguous empty override unless public       | MS             |
| AUTH-003   | security    | error   | `securitySchemes` referenced exist in components                                  | OpenAPI        |
| AUTH-004   | security    | info    | Prefer `bearer` JWT naming `Authorization` header                                 | MS             |
| AUTH-005   | security    | warning | No API keys in query for new designs (prefer headers)                             | Google         |
| PAG-001    | pagination  | warning | List endpoints define page/cursor param or documented full set                    | Google/Zalando |
| PAG-002    | pagination  | warning | Page size param has max/bounds guidance                                           | Zalando        |
| PAG-003    | pagination  | info    | Total count field documented if provided                                          | Google         |
| VER-001    | versioning  | warning | Consistent version style across servers/paths                                     | MS             |
| VER-002    | versioning  | warning | Breaking change policy: major in path/header documented                           | MS             |
| VER-003    | versioning  | info    | `info.version` semver-ish                                                         | Google         |
| DEPR-001   | deprecation | warning | `deprecated: true` ops include `x-sunset` or sunset docs                          | MS             |
| DEPR-002   | deprecation | info    | Deprecated ops keep summary prefix `[deprecated]`                                 | MS             |
| CONS-001   | consistency | warning | Consistent casing style across enum values                                        | Google         |
| CONS-002   | consistency | info    | Consistent date-time format (RFC 3339) in schemas                                 | Google/MS      |
| CONS-003   | consistency | warning | Consistent pagination param naming across collection ops                          | Zalando        |
| SEC-001    | security    | warning | Examples must not look like real secrets (entropy/pattern)                        | Internal       |
| SEC-002    | security    | warning | `servers` use `https` for non-local                                               | RFC 9110/MS    |
| SEC-003    | security    | info    | Sensitive fields (`password`, `token`) not exposed in responses schemas           | Google         |
| PERF-001   | performance | info    | Spec file size budget warning (> 2 MB)                                            | Internal       |

Conteo del inventario: **≥ 65 IDs** comprometidos (meta ≥ 50 activos; algunos pueden salir como `info` y quitarse solo con changelog).

> La tabla es el **contrato de cobertura**. El YAML real vive en `packs/elite/**`. Al cerrar f1, un test de CI cuenta reglas activas ≥ 50 y valida el inventario mínimo (allowlist de ids esperados — ids de la tabla no pueden desaparecer sin changelog BREAKING).

### Ejemplos de reglas (referencia de estilo YAML)

```yaml
# rules/naming.yaml
- id: NAMING-001
  category: naming
  severity: error
  message: "Resource path segments should be plural nouns."
  fix: "Rename last path segment to plural (user → users)."
  source:
    title: Google API Design Guide
    url: https://cloud.google.com/apis/design
    section: "Methods and GET-ability / resource naming"
  when:
    all:
      - op: pathSegmentPlural
        segmentIndex: last

- id: NAMING-009
  category: naming
  severity: error
  message: "Path template parameter must be declared in operation parameters."
  source:
    title: OpenAPI Specification
    url: https://spec.openapis.org/oas/v3.1.0
  when:
    op: pathParamUndeclared # ← EXTENSIÓN: añadir átomo al engine si no existe
```

> **Nota de cierre de contrato:** si una regla del inventario necesita un átomo no listado en `f1-engine` §3, se **añade el átomo al engine** (whitelist) y se actualiza ese spec antes de merge del pack. Preferimos átomo fino a reglas ad-hoc.

## 4. Criterios de aceptación

- [x] **AC-P.1** Test CI: `rules.length >= 50` con `enabledByDefault !== false`.
- [x] **AC-P.2** Test CI: 100% de reglas del pack tienen `source.url` válida (formato URL) — `strictSource`.
- [x] **AC-P.3** Test CI: ids únicos globales; formato `PREFIX-NNN`.
- [x] **AC-P.4** Test CI: `validateRule` (engine) pasa para **todas** las reglas del pack.
- [x] **AC-P.5** Inventario mínimo: todos los ids de la tabla presentes o removidos con entrada en `CHANGELOG.md`.
- [x] **AC-P.6** Fixtures: `ruido` — petstore y 2 specs de ejemplo públicos downloadeados **committeados** (no red en CI) con thresholds: findings ≤ máx documentado por fixture (snapshot estable).
- [x] **AC-P.7** CHANGELOG `2026.09.1` documenta conteo total y impacto por severidad en fixtures.
- [x] **AC-P.8** Pack embebido: `@apigovscan/cli` incluye el pack sin red (test AC-O/INV-1).
- [x] **AC-P.9** `apigovscan rules explain NAMING-001` muestra mensaje + fuente + url (puede llegar en f1-analyze o CLI commands — mínimo: export `explain(ruleId)` unit-testeado).
- [x] **AC-P.10** Ningún `message` contiene traducciones no deterministas (locale) — solo strings literales EN.

## 5. Test plan

| Test                                    | Tipo             |
| --------------------------------------- | ---------------- |
| pack-validate (schema, count, sources)  | script CI        |
| validateRule all rules                  | unit             |
| ruido fixtures snapshots                | unit/integration |
| golden: petstore findings set congelado | integration      |

## 6. Dependencias

- `f1-engine` (validador + átomos; posibles extensiones de átomos)
- `f1-openapi` (fixtures de impacto)
- Curaduría humana de mensajes/fuentes (paralelizable con engine)

## 7. Riesgos y decisiones abiertas

| Riesgo                                     | Mitigación                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Alcanzar 50 reglas con calidad vs rellenar | Priorizar errores/warnings útiles; el resto `info`; threshold de ruido en AC-P.6 |
| Átomos faltantes descubiertos tarde        | Proceso: inventor → gap analysis de átomos → engine first                        |
| URLs de fuentes cambian                    | `sources.yaml` + link check post-f1 (worker f6)                                  |

## Changelog

- 2026-09-23 · Spec creado desde SDD v1.0.
- 2026-09-24 · M1.5: inventario completo (65 IDs) en `packs/elite/rules/`; AC-P.1…10 verdes; `explain` + CLI `rules explain`; pack embebido vía `packages/cli` build; fixtures públicos committeados con thresholds; CHANGELOG `2026.09.1` con impacto por severidad. Estado → `implementada`.
