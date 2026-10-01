# f8-spectral-import · Import offline de reglas Spectral

| Campo     | Valor                                   |
| --------- | --------------------------------------- |
| Estado    | implementada                            |
| Fase      | 8                                       |
| Deriva de | ADR-014; `f8-rules-import`; INV-1/INV-4 |

## 1. Objetivo

Transpilar un subconjunto explícito de reglas Spectral a drafts de reglas
ApiGovScan para que el engine existente las valide y ejecute. No ejecutar el
DSL de Spectral ni agregar un segundo motor.

## 2. Límites innegociables

- Importación local y offline: leer un archivo que el usuario señale y escribir
  drafts solo al output explícito.
- Nada de JSONPath en runtime, `eval`, `new Function`, funciones JS custom ni
  carga de reglas desde red.
- Cada regla importada conserva la fuente Spectral (título/URL) y el origen
  (`given`/función) como metadata de explicación.
- Las reglas no representables se omiten con un motivo individual; nunca se
  aproximan silenciosamente ni se convierten en reglas de éxito aparente.

## 3. Corte candidato

Empezar por reglas OAS con `given` y funciones que tengan traducción directa a
átomos whitelist del engine (por ejemplo, `truthy`, `pattern` y
`operation-singular-tag`, sujeto al spike ADR-014). El corte exacto queda
pendiente de inventario verificable contra la versión fijada del ruleset.

## 3b. Inventario verificable (spike 2026-10-01, ruleset `oas` de `@stoplight/spectral-rulesets@1.23.0`)

Dump del ruleset resuelto: **57 reglas, 24 funciones** (`truthy`, `pattern`,
`schema`, `alphabetical`, `length`, `xor`, `uniquenessTags`, `refSiblings`,
`serverVariables`, `typedEnum` + 14 funciones `oas*`/`unreferenced*`).
Licencia del paquete: Apache-2.0 (compatible; vendorear requiere atribución).

Clasificación exacta de las 57:

| Bucket | # | Reglas |
| ------ | - | ------ |
| A · ya cubiertas por elite | 14 | operation-success-response, operation-operationId, operation-operationId-unique, operation-parameters, operation-tag-defined, path-params, path-keys-no-trailing-slash, path-not-include-query, oas3-operation-security-defined, oas3-unused-component (parcial), oas3-api-servers, info-description, operation-description, operation-tags |
| B · transpilables netas (shapes §3c) | 4 | path-declarations-must-exist, no-eval-in-markdown, no-script-tags-in-markdown, operation-operationId-valid-in-url |
| C · port curado (átomos nuevos, épica aparte) | 15 | info-contact, info-license, license-url, contact-properties, oas3-server-not-example.com, oas3-server-trailing-slash, oas3-server-variables, duplicated-entry-in-enum, array-items, no-$ref-siblings, openapi-tags-uniqueness, tag-description, oas3-parameter-description, operation-singular-tag, openapi-tags-alphabetical |
| D · skip honesto (motivo por regla) | 24 | 14 × `oas2-*` (Swagger se convierte, no se gobierna), oas3-schema, oas3-valid-media-example, oas3-valid-schema-example, typed-enum (JSON Schema completo), oas3-examples-value-or-externalValue (xor de Example Object), oas3-callbacks-in-callbacks, oas3_1-callbacks-in-webhook, oas3_1-servers-in-webhook, oas3_2-no-deprecated-xml-attribute, openapi-tags (schema root) |

**Corrección al ADR-014:** `operation-singular-tag` (`length`) y
`openapi-tags-alphabetical` (`alphabetical`) figuran ahí como
"solo-transpilable como custom", pero el engine **no tiene** átomos `length`/
`alphabetical` hoy (verificado contra `atoms.ts`); se reclasifican a port
curado (C). La conclusión del ADR (transpilar, no ejecutar) no cambia.

**Dato clave:** el valor del transpiler no está en importar `spectral:oas`
(4 netas nuevas) sino en las **reglas propias del usuario** que caen en los
shapes de §3c — el corte es genérico por forma, no una lista hardcodeada de
nombres.

## 3c. Shapes transliterables v0 (lista cerrada, cada una con test true/false)

Semántica Spectral `pattern`: la regla **dispara** cuando `notMatch` matchea
o cuando `match` no matchea. `truthy` dispara cuando el campo está ausente/vacío.

| # | Shape (given + then) | Traducción Ankaa | Aproximación documentada |
| - | -------------------- | ---------------- | ------------------------ |
| S1 | `$.paths` + `pattern(@key, notMatch)` | `pathMatches(re)` (op-scope) | claves de paths ≡ op.path (paths sin verbos no inspeccionan) |
| S2 | `$.paths` + `pattern(@key, match)` | `not pathMatches(re)` | ídem S1 |
| S3 | `#OperationObject` + `pattern(operationId, match)` | `not operationIdPattern(re)` | — |
| S4 | `#OperationObject` + `pattern(operationId, notMatch)` | `operationIdPattern(re)` | — |
| S5 | `$..[description,title]` + `pattern(notMatch)` | `any: [descriptionMatches(re), descriptionMatches(re, summary)]` | solo operation-level (descripciones de schemas/info no matchean — el modelo no las recorre por regla) |
| S6 | `$..[description,title]` + `pattern(match)` | `not any: [...]` ídem S5 | ídem S5 |
| S7 | `#OperationObject` + `truthy(field)` | `missingField(field)` — fields: `description`, `operationId`, `summary`, `tags` | — |

Todo lo que no matchea un shape exacto → **skip con motivo** (nunca silencioso,
nunca aproximado). Regex de entrada pasa por `safeRegex` (guard ReDoS ya
existente); flags de regex de Spectral no soportados → skip.

## 4. Decisiones del dueño (2026-10-01, cierran las preguntas previas)

| Tema                   | Decisión                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ |
| `extends` offline      | **Vendor pineado**: copia del ruleset `oas` 1.23.0 serializada y commiteada dentro de Ankaa (p. ej. `packages/cli/spectral/`, con atribución Apache-2.0); `extends: ["spectral:oas"]` resuelve 100% offline contra esa copia fija. `extends` a archivos locales del usuario: sí (profundidad máx 5, sin ciclos). Cualquier otro target (URL/npm/`spectral:oas3`/`spectral:asyncapi`) → error claro con la lista soportada. Cero red en runtime (INV-1). |
| Alcance transpiler     | **Shapes genéricos S1..S7** (§3c): cualquier regla del usuario que caiga en un shape se importa, haya o no estado en `spectral:oas`. Fuera de shape → skip con motivo. |
| Ids y metadata         | **`SPEC-001..`** por orden alfabético del nombre Spectral (determinista, cumple `RULE_ID_RE`); severidad `0/1/2 → error/warning/info`; `description` → message; `documentationUrl` → `source.url`; `source.title = "Spectral: <name>"`; `given`/función quedan como metadata de explicación en el draft. |
| Salida                 | **Envelope del pipeline `rules import` existente**: draft YAML de custom rules (cada regla pasa `validateRule` o se omite con motivo) + resumen `imported: N` (con equivalencias elite marcadas) / `skipped: M` con motivo por regla. Exit 0/2. |
| Límites                | **Reusar existentes**: `ParseLimits` (10 MB, depth 100), cap 500 reglas procesadas, `safeRegex` anti-ReDoS, flags de regex no soportados → skip. |

## 5. Fuera de alcance

Ejecutar rulesets Spectral; equivalencia completa con Spectral; reglas con JS
custom o validación completa JSON Schema; red, LLM o publicación automática de
drafts.

## Changelog

- 2026-09-30 · Draft inicial desde ADR-014.
- 2026-10-01 · Spike de inventario verificable contra
  `@stoplight/spectral-rulesets@1.23.0` (§3b): 57 reglas → 14 cubiertas /
  4 transpilables netas / 15 port curado / 24 skip honesto; corrección al
  ADR (`length`/`alphabetical` no tienen átomos hoy); shapes cerrados S1..S7
  (§3c) con semántica `match`/`notMatch` verificada. Pendiente: decisiones
  §4 con el dueño.
- 2026-10-01 · Dueño cierra §4: vendor pineado 1.23.0 + shapes genéricos +
  SPEC-NNN + envelope existente + límites reusados → spec `ready`.
- 2026-10-01 · M17.9 implementado: vendor `src/vendor-oas.ts` (módulo TS
  generado, bundleado — cero IO) + `src/spectral.ts` (resolver extends
  offline con ciclo/depth guards, clasificador shapes S1..S7, emisor
  `SPEC-NNN` estampado como custom y validado por `validateRule`) + CLI
  `ankaa migrate --spectral-rules [--out] [--force] [--dry-run]` + 18 tests
  (unit + e2e con evaluación end-to-end del draft) → `implementada`.
  Follow-ups documentados: port curado (bucket C, épica aparte per ADR-14) y
  `--spectral-disables` (mapper de líneas, como en migration-kit).

## Referencias

- [ADR-014](../docs/02-arquitectura.md): Spectral se transpila, no se ejecuta.
- [f8-rules-import](f8-rules-import.md): pipeline local de importación.
