# f11-coverage · Métrica de cobertura de gobernanza

| Campo     | Valor                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                        |
| Fase      | 11 (backlog M8.6 → ejecución)                                                                                  |
| Deriva de | Backlog M8.6 (`tasks/f8-elite-100.md`); INV-2 (determinismo); `f1-engine` (átomos), `f1-reporters` (reportHash) |
| Packages  | `@apigovscan/core` (cómputo) + `@apigovscan/reporters` (reporte) + cli (`analyze`, dashboard, `scan-org`)      |

## 1. Objetivo

Como tech lead, quiero saber **qué % de la superficie de mi spec mira alguna regla del pack**, para detectar puntos ciegos de gobernanza (ej. "ninguna regla inspecciona `responses`" o "los schemas están sin cubrir").

**Definición v1 (estática y honesta):** cada átomo del DSL declara una **clase primaria de nodo** que inspecciona (`operation | parameter | requestBody | response | schema | doc`). Una clase está cubierta si ≥1 regla **activa** la inspecciona; todos los nodos de una clase cubierta cuentan como inspeccionados.

- `coverage.pct = round(100 · inspected / total)`.
- Es una **aproximación estática**, no instrumentación de lecturas reales del engine (eso sería invasivo y riesgoso para INV-2/perf). Se documenta como tal en el dashboard.

## 2. Alcance

### Dentro

- `computeCoverage(specs, packs, { customRules?, disabledRuleIds? })` en `@apigovscan/core` (puro, sin I/O):
  - Inventario por spec: operaciones, parámetros, requestBodies presentes, responses, `components.schemas`, checklist doc fija (6: `info.title`, `info.version`, `info.description`, `servers`, `tags`, `security`).
  - Reglas activas con la misma semántica que el engine (helper compartido `isRuleActive`: respeta `disabledRuleIds`, `deprecated`, `enabledByDefault: false` sin habilitación explícita; duplicados: gana el primero, igual que `evaluate`).
  - Reglas inválidas se **saltan** (no pueden correr; `evaluate` ya las excluye de findings y las reporta en `errors`).
  - El mapeo átomo→clase es `Record<AtomOp, CoverageClass>` tipado: **agregar un átomo sin mapearlo es error de compilación**.
- `Report.coverage?` (`{ total, inspected, pct, byClass }`): lo calcula `analyze` y viaja en el JSON; entra al `reportHash` cuando está presente (criterio `skillsSuppressed`).
- Console: segmento `· coverage NN% (i/t nodes)` en la línea de resumen cuando el reporte lo trae.
- Dashboard: badge de cobertura en el header (con tooltip de definición + link a clases); reportes viejos sin `coverage` no muestran badge.
- `scan-org`: `coverage` (pct) por repo + `avgCoverage` por grupo y global; columna en consola y campo en JSON.

### Fuera

- Instrumentación real de lecturas por átomo (v2 si la aproximación no alcanza).
- Pesos por clase o por severidad (v1: cada nodo vale 1).
- Gate `fail-on` por cobertura (v2 con historia de consumidor).
- `drift` no calcula cobertura (su reporte no la incluye; el dashboard la omite).

## 3. Contrato

```ts
// packages/core/src/coverage.ts
export type CoverageClass =
  | "operation" | "parameter" | "requestBody" | "response" | "schema" | "doc";

export interface CoverageByClass { total: number; inspected: number }
export interface Coverage {
  total: number;
  inspected: number;
  pct: number; // 0..100 redondeado
  byClass: Record<CoverageClass, CoverageByClass>;
}

export function isRuleActive(
  rule: Rule,
  customRuleIds: ReadonlySet<string>,
  disabledRuleIds?: ReadonlySet<string>,
): boolean;

export function computeCoverage(
  specs: readonly Spec[],
  packs: readonly RulePack[],
  opts?: { customRules?: readonly Rule[]; disabledRuleIds?: ReadonlySet<string> },
): Coverage;
```

```ts
// packages/reporters/src/build.ts
export interface Report {
  // ...existente
  coverage?: Coverage; // de @apigovscan/core; entra al hash si presente
}
```

- `analyze` computa cobertura sobre **todos** los specs del run con packs + customs + disabled (misma base que `evaluate`).
- `scan-org`: `RepoScan.coverage: number` (pct), `GroupScan.avgCoverage`, `OrgReport.avgCoverage` (promedio redondeado; 100 si sin repos, igual criterio que `avgScore`).
- Warnings: ninguno nuevo (la cobertura no advierte; solo informa).

## 4. Criterios de aceptación

- [x] **AC-CV.1** Spec con solo reglas de naming ⇒ `response`/`schema` con `inspected: 0`; `operation` cubierto; `pct` = redondeo exacto del cociente.
- [x] **AC-CV.2** Regla deshabilitada/deprecated/`enabledByDefault: false` sin habilitar ⇒ su clase no cuenta.
- [x] **AC-CV.3** Mismo input dos veces ⇒ `coverage` deep-equal (INV-2); `computeReportHash` verifica con cobertura presente.
- [x] **AC-CV.4** Reporte sin `coverage` (viejos, drift) ⇒ console/dashboard idénticos a antes (compatibilidad).
- [x] **AC-CV.5** e2e `analyze` sobre fixture ⇒ JSON trae `coverage` con `total/inspected/pct/byClass` coherentes.
- [x] **AC-CV.6** `scan-org` e2e ⇒ por repo `coverage` + `avgCoverage` global; JSON y consola lo muestran.
- [x] **AC-CV.7** Compilación falla si un átomo del whitelist no tiene clase (`Record<AtomOp, CoverageClass>`; verificado al agregar el mapeo: tsc falló hasta completarlo).

## 5. Test plan

- Unit core: inventario por clase, pct/redondeo, exclusiones (disabled/deprecated/opt-in), determinismo, skip de regla inválida.
- Unit reporters: `coverage` entra al hash; ausente ⇒ shape legacy byte-idéntico.
- E2E cli: `analyze` fixture con cobertura; dashboard render con/sin coverage; `scan-org` con avgCoverage.
- `pnpm check` verde.

## 6. Dependencias

- `f1-engine` (tipos `Spec`/`Rule`/`Matcher`, whitelist de átomos).
- `f1-reporters` (contrato `Report` + hash) — enmienda menor en esta spec.
- `f10-dashboard`, `f8-scan-org` (consumidores) — changelog al cerrar.

## 7. Riesgos y decisiones abiertas

| Tema                                    | Decisión v1                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Aproximación vs instrumentación         | Estática por clase primaria; documentada como aproximación. Costo O(reglas×átomos), sin tocar perf.   |
| Checklist doc fija (6)                  | Denominador estable aunque el spec no traiga el campo (ausencia también es gobernable).              |
| `headerRequired` (request/response)     | Clase primaria `response` (caso dominante: headers de respuesta como Sunset). Aproximación documentada.|
| `sensitiveExample`                      | Clase `response` (ejemplos de respuesta; los de request quedan fuera de v1).                         |
| Reglas inválidas en `computeCoverage`   | Se saltan (el engine ya las reporta en `errors`; analyze falla antes en load de todos modos).        |
| `reportHash` con cobertura              | Incluye `coverage` si presente (igual que `skillsSuppressed`); reportes viejos verifican igual.      |

## Changelog

- 2026-09-30 · Spec creado en `ready` (backlog M8.6 [AHORA] #3; handoff vía AGENTS.md + este spec).
- 2026-09-30 · Implementado → `cerrada` (AC-CV.1…7 verdes; `computeCoverage` + `mergeCoverages` en core con `isRuleActive` compartido con el engine; `Report.coverage` + hash; console, dashboard badge, `scan-org` avg; `pnpm check` verde).
