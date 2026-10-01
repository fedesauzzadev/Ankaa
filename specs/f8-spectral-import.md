# f8-spectral-import · Import offline de reglas Spectral

| Campo     | Valor                                   |
| --------- | --------------------------------------- |
| Estado    | draft                                   |
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

## 4. Preguntas para pasar a `ready`

- ¿Qué versión/esquema de ruleset Spectral se aceptan y cómo se seleccionan
  rulesets extends sin resolver paquetes ni URLs?
- ¿Cuál es la lista cerrada de funciones, expresiones `given` y opciones
  transliterables, cada una con tests positivos y negativos?
- ¿Cómo se representa severidad, descripción, documentación y source URL en
  custom rules?
- ¿Qué límite de tamaño/profundidad protege al importador de archivos enormes?
- ¿Qué salida resume reglas importadas y reglas omitidas, y cuál es el formato
  de error ante una regla inválida?

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

## Referencias

- [ADR-014](../docs/02-arquitectura.md): Spectral se transpila, no se ejecuta.
- [f8-rules-import](f8-rules-import.md): pipeline local de importación.
