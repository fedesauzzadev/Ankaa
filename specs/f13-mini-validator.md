# f13-mini-validator · Mini-validador de ejemplos contra schemas

| Campo     | Valor                                                          |
| --------- | -------------------------------------------------------------- |
| Estado    | implementada                                                   |
| Fase      | 13 (backlog [f17](../plans/f17-diferenciales.md) T2 #6)        |
| Fecha     | 2026-09-30                                                     |
| Deriva de | Backlog M8.6; hueco explícito del pack elite; INV-1..INV-4/INV-7 |

## 1. Objetivo / user story

Como dev o tech writer, quiero saber si los `example` de mi spec **mienten**
respecto del schema que dicen ilustrar (docs, mocks y tests de contrato se
rompen por eso), con validación determinista y offline — sin traer un validador
JSON Schema completo al core.

## 2. Decisiones (2026-09-30, delegadas por el dueño — cierre de T2)

| Tema                      | Decisión                                                                       |
| ------------------------ | ------------------------------------------------------------------------------ |
| Subset soportado         | **Lo que el modelo `Spec` transporta**: `type` (uniones 3.1 incluidas), `enum`, `required`, `properties`, `items`, `maxLength`, `maximum` + resolución de `$ref` locales. `minLength`/`minimum`/`allOf` no viajan en `SchemaNode` hoy → follow-up con spec de `f1-openapi` (documentado) |
| Keywords de validación NO soportadas | `pattern`, `multipleOf`, `exclusive*`, `minItems`/`maxItems`, `uniqueItems`, `minProperties`/`maxProperties`, `minLength`/`minimum` (fuera del modelo), `oneOf`/`anyOf`/`not`, `if`/`then`/`else`, `allOf` (fuera del modelo), `additionalProperties` → **no evaluadas**: marcan el resultado `partial` (nunca un "valid" silencioso) |
| Keywords de anotación    | `format`, `description`, `title`, `default`, `readOnly`/`writeOnly`, `deprecated`, `nullable`, `externalDocs`, `xml`, `discriminator` → ignoradas **sin** marcar `partial` (no cambian la validez del subset) |
| Qué se inspecciona       | `example` a **nivel schema** (lo que el parser preserva) en parameters, requestBody y responses por operación |
| `$ref`                   | Solo locales `#/components/schemas/*`; remotos/irresolubles y ciclos → `skipped` explícito |
| Presupuestos             | Profundidad ≤ 24 · ejemplo ≤ 100 KB (`JSON.stringify`); excedido ⇒ `skipped` |
| Hallazgos                | `EXVAL-001` warning (invalid, pointer al nodo del example que falla) · `EXVAL-002` info (skipped con motivo) — categorías `schemas`, fuente OAS 3.1 |
| Comando                  | `ankaa validate-examples <path>` gated como `diff`; `--format console|json`, `--output`, `--fail-on`, skills/overrides aplicados |

## 3. Contrato

```bash
ankaa validate-examples openapi.yaml                    # console + counts
ankaa validate-examples specs/ --format json --output examples-report.json
```

- Console: primera línea `examples: N checked · V valid · P partial · I invalid · S skipped` + reporte estándar de findings.
- JSON: reporte canónico (`reportHash`, INV-2) con pack `examples@<version>`.
- Exit codes como `analyze` (`--fail-on` sobre EXVAL-001/002): default `error`
  ⇒ warnings de ejemplos no rompen CI solos; `--fail-on warning` sí.
- Determinismo: mismo spec ⇒ mismos findings, mismo orden, mismo hash.

## 4. Alcance (in / out)

### In (M17.6)

- `validateExamples(spec, {packVersion})` en `packages/core/src/examples.ts`
  (findings + counts), exportado del package.
- CLI `ankaa validate-examples` (gated, skills/severity overrides aplicados,
  sink estándar).
- Tests de subset (true/false), ciclos/refs, presupuestos, determinismo, e2e.

### Out (v0) — follow-ups documentados

- `examples` (plural, media-level) y media-level `example`: el parser no los
  preserva hoy (extendir `f1-openapi` primero).
- Componentes con example no referenciados por operaciones.
- `oneOf`/`anyOf`/`not`, `format` validation, `minLength`/`minimum`/`allOf`
  (requieren extender el parser/`f1-openapi` primero), example-vs-schema en
  drift.
- Integración como átomo del pack elite (requiere medir ruido con fp-budget).

## 5. Criterios de aceptación

- [x] AC-MV.1 Subset especificado antes de implementar (§2 de este spec).
- [x] AC-MV.2 Casos válidos e inválidos → findings deterministas con pointers
      reproducibles (al nodo del example y schema involucrado).
- [x] AC-MV.3 `$ref` remoto, ciclos y keywords fuera del subset producen
      resultado explícito (`partial`/`skipped` + EXVAL-002), nunca un falso
      éxito silencioso.
- [x] AC-MV.4 Fixtures de ataque y límites: profundidad, tamaño y ciclos
      quedan acotados (skipped, sin crash ni hang).
- [x] AC-MV.5 e2e: exit codes por `--fail-on`, gating de licencia, `--output`,
      determinismo del `reportHash`.
- [x] AC-MV.6 `pnpm check` e invariantes verdes.

## 6. Test plan

| Caso                                                        | Tipo |
| ----------------------------------------------------------- | ---- |
| Subset true/false (cada keyword, uniones 3.1, allOf)         | unit |
| Refs: local ok, remoto/irresoluble/ciclo → EXVAL-002        | unit |
| Presupuestos depth/size → skipped sin hang                   | unit |
| Determinismo (mismo spec ⇒ mismo hash) + orden estable       | unit |
| e2e CLI: console counts, json, fail-on, gating, INV-7        | e2e  |

## 7. Dependencias

- `f1-openapi` (parser; `SchemaNode.example` ya preservado).
- `f1-reporters` (buildReport/sinks), `f2` overrides/skills (reuso del diff).

## 8. Riesgos y notas

- Severidad warning en v0: promoción a error solo con evidencia fp-budget.
- `partial` es honestidad, no ruido: no genera finding (solo el count).
- La integración futura como átomo/pack cambiaría fingerprints — no mezclar.

## Changelog

- 2026-09-30 · Draft inicial (backlog M8.6).
- 2026-09-30 · Cierre de T2: dueño delega las decisiones (§2) — subset,
  budgets, EXVAL-001/002 y comando `validate-examples` gated → `ready`.
- 2026-10-01 · M17.6 implementado: `validateExamples` en core + CLI
  `validate-examples` + 16 tests (AC-MV.1..6) → `implementada`. Nota: el
  parser prohíbe `$ref` remotos (`REF_REMOTE_FORBIDDEN`), por lo que la vía
  CLI alcanza el skip con `$ref` local irresoluble o ciclo; el caso remoto
  queda cubierto a nivel core (defensa ante modelos sintéticos).
