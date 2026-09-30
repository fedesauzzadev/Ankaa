# f12-breaking · Diff spec-vs-spec (breaking changes)

| Campo     | Valor                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                 |
| Fase      | 12 (backlog M8.6 → ejecución)                                                                           |
| Deriva de | Backlog M8.6 (`tasks/f8-elite-100.md`); INV-2/INV-5 (determinismo, fingerprints); `f1-reporters` (hash) |
| Packages  | `@apigovscan/core` (`diff.ts` puro) + cli (`diff`, reaprovecha sinks/reporters/skills)                 |

## 1. Objetivo

Como dev a punto de publicar una nueva versión de mi API, quiero correr `apigovscan diff base.yaml head.yaml` y ver **qué rompe a mis clientes** (operaciones eliminadas, requeridos agregados, enums recortados, tipos cambiados, auth endurecida), con findings de primera clase (fingerprint, fix, source) que fluyen a reportes, dashboard y suppressions sin código extra.

**Decisión arquitectónica:** motor de diff standalone en core (`diffSpecs`), NO átomos cross-document en el engine. Motivo: el engine evalúa cada spec de forma independiente (por operación / por documento); correlacionar viejo↔nuevo rompería ese modelo y obligaría a pasar contexto histórico por todos los átomos. El diff produce `Finding[]` estándar (mismo fingerprint/sort) y el CLI lo envuelve en `Report` vía `buildReport` — todo lo demás (sinks, skills, dashboard, sarif) se reaprovecha.

## 2. Alcance

### Dentro

- CLI `apigovscan diff <old> <new>`: formatos console|json|sarif|markdown|annotations, `--output`, `--fail-on`, `--skills-dir`, `--no-color`, `--license-key` (mismo gate que `analyze`: corre análisis en memoria — dejarlo libre sería un bypass, precedente `fix`).
- Catálogo v1 (8 checks, todos `error` — todos rompen clientes):
  - `BRK-001` operación eliminada (`METHOD path` existía, ya no).
  - `BRK-002` parámetro requerido agregado (query/header/cookie con `required: true` que no existía).
  - `BRK-003` request body eliminado o vuelto requerido.
  - `BRK-004` propiedad requerida agregada al schema de request.
  - `BRK-005` response status eliminado.
  - `BRK-006` valor de enum eliminado (params + request/response).
  - `BRK-007` `type`/`format` de schema cambiado (comparación estricta).
  - `BRK-008` seguridad endurecida (sin requisitos → con requisitos; o scopes agregados). Compara seguridad **efectiva** (operación ?? default del doc).
- Matching de endpoints por `METHOD + path` exacto. Un rename aparece como remove (+ add silencioso: lo nuevo no rompe) — correcto y documentado.
- `$ref` `#/components/schemas/X` resuelto (cadenas con guarda de ciclos); recorrido de schemas: raíz + `properties` + `items`.
- `location` con labels estilo multi-input de analyze: `old.yaml#/paths/…` si el nodo solo existe en old, `new.yaml#/…` si existe en new. `apiLocation` sin label (`GET /users`).
- Findings de schema apuntan al ancestro con pointer (response/requestBody/parámetro); el mensaje nombra la propiedad.
- Findings pasan por: severity overrides (`rules:` config + `severities.yaml`), `disabledRuleIds` (`off`), skills suppressions (fingerprints estables entre versiones — un waiver BRK sobrevive al bump). Sin baseline v1 (semántica de "hallazgos viejos" no mapea; documentado).
- Sin cobertura v1 (`Report.coverage` ausente; el dashboard ya maneja ausencia).
- Determinismo: mismo par dos veces ⇒ findings byte-idénticos (sort + fingerprint estándar). Specs idénticos ⇒ 0 findings.

### Fuera

- Detección de renames por similitud/operationId (v2).
- Media types eliminados, `min/max`/`maxLength` endurecidos, `required` agregado en responses, fechas `x-sunset` (candidatos v2 documentados — no prometidos).
- Reglas DSL custom sobre el diff (el catálogo es built-in versionado con el tool).
- `fix`/MCP/`drift` sobre reportes diff (documentado; `fix` re-analiza un solo spec).
- Gate `fail-on` por cobertura; baseline en diff.

## 3. Contrato

```ts
// packages/core/src/diff.ts
export interface DiffOptions {
  oldLabel: string; // "base.yaml" (para locations de nodos solo-old)
  newLabel: string; // "head.yaml"
  packVersion: string; // lo pone el CLI (packageVersion); fuera del fingerprint
}
export interface DiffResult { findings: Finding[] } // sort estable aplicado

export function diffSpecs(oldSpec: Spec, newSpec: Spec, opts: DiffOptions): DiffResult;
```

```ts
// RuleIds BRK-001…008, packId "diff", severity error, message/fix EN, source:
// BRK-001/005/006/007 → Semantic Versioning 2.0.0 (removal/change = major)
// BRK-002/003/004 → OpenAPI Specification (Parameter/Request Body Object)
// BRK-008 → RFC 9110 / OAuth 2.0 (auth requerida rompe llamadas anónimas)
```

- CLI: `diff` exige licencia (gate `checkLicense`); parsea ambos archivos con la misma detección de protocolo que `analyze` (OpenAPI-first, multi-protocolo gratis vía `Spec` normalizado).
- Report: `buildReport({ results: [{ findings, errors: [] }], inputs: [old, new], packs: [{ id: "diff", version }], ... })` + skills suppressions + severity overrides + `failOn` estándar.

## 4. Criterios de aceptación

- [x] **AC-BK.1** Cada check BRK-00N: fixture positivo (rompe ⇒ 1 finding con fingerprint estable) + negativo (no rompe ⇒ 0 findings).
- [x] **AC-BK.2** Specs idénticos ⇒ 0 findings; mismo par dos veces ⇒ byte-idéntico (INV-2).
- [x] **AC-BK.3** `$ref` cíclico no cuelga ni duplica (guarda de ciclos; test dedicado).
- [x] **AC-BK.4** e2e: `diff base head --format json` trae `packs: [{id: "diff"}]`, inputs old+new, findings con labels old#/new#; exit 1 con findings (fail-on error), 0 sin cambios.
- [x] **AC-BK.5** e2e: sin licencia ⇒ exit 2; `rules: {BRK-001: off}` lo apaga; suppression por fingerprint lo oculta (`skillsSuppressed: 1`).
- [x] **AC-BK.6** Rename de path ⇒ BRK-001 sobre el path viejo (documentado, no rename-magic).
- [x] **AC-BK.7** `pnpm check` verde; `core` sigue sin `node:*` (INV-3).

## 5. Test plan

- Unit core `packages/core/test/diff.test.ts`: 8 checks × pos/neg, idénticos, determinismo, ciclos, seguridad efectiva doc-default, scopes.
- E2E cli `packages/cli/test/diff.e2e.test.ts`: AC-BK.4/5/6 (usa `DEV_LICENSE_KEY` como scan-org e2e).
- `pnpm check` verde.

## 6. Dependencias

- `f1-engine` (tipos `Spec`, `Finding`, `computeFingerprint`, `sortFindings`).
- `f1-reporters` (`buildReport`, sinks) — sin cambios de contrato.
- `f1-analyze`/`f3-skills` (patrones CLI: license gate, skills, failOn) — reaprovecho, sin cambios.

## 7. Riesgos y decisiones abiertas

| Tema                                  | Decisión v1                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Átomos cross-doc vs módulo standalone | Standalone (no contamina el modelo de evaluación; findings estándar lo integran todo).      |
| Severidades                           | Todas `error` (el catálogo v1 solo incluye rupturas reales; overrides permiten bajarlas).  |
| Comparación de tipos estricta         | `type`/`format` distintos ⇒ flag (incluye `string` → `[string, null]`; documentado).       |
| Profundidad de recorrido              | Raíz + properties + items con `$ref` encadenado; `allOf/oneOf` no existen en `SchemaNode`. |
| Media types eliminados                | Fuera v1 (solo se comparan media types compartidos).                                       |
| Baseline en diff                      | Fuera (sin semántica clara; skills sí aplican).                                            |

## Changelog

- 2026-09-30 · Spec creado en `ready` (backlog M8.6 [AHORA] #4; handoff vía AGENTS.md + este spec).
- 2026-09-30 · Implementado → `cerrada` (AC-BK.1…7 verdes; `diffSpecs` standalone en core con catálogo BRK-001…008 + `$ref` con guarda de ciclos; CLI `diff` con license gate, skills, severity overrides y sinks reaprovechados; `pnpm check` verde).
