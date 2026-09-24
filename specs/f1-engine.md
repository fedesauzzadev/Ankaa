# f1-engine · Rules engine + DSL + fingerprints

| Campo | Valor |
|---|---|
| Estado | ready |
| Fase | 1 |
| Deriva de | SDD ADR-005, ADR-006, ADR-011, D5; doc 03 motor y reglas; INV-2/3/4 |
| Package | `@apigovscan/core` |

## 1. Objetivo

Evaluar reglas declarativas (pack elite + custom) sobre un `Spec` normalizado y producir `Finding[]` **ordenados de forma estable**, con fingerprint, sin I/O, sin eval, sin LLM.

## 2. Alcance

### Dentro

- Schema/validación de `Rule` y `RulePack`.
- Carga de packs desde objetos en memoria (el FS es del adapter).
- DSL: combinadores `all|any|not` + whitelist de constructores v1 (lista cerrada §3).
- Evaluación por operación y por documento.
- Producción de `Finding` + fingerprint sha256.
- Orden estable + dedupe.
- Overrides de severidad (`severityOverride?: Map<ruleId, Severity>`) — base para config `rules:` y skills futuros.
- Exclusión de reglas (`disabledRuleIds: Set<string>`).
- **No** implementa suppressions por fingerprint ni baseline (f2) — deja el punto de extensión.

### Fuera

- Parseo YAML de packs (loader trivial sí: acepta objeto ya parseado).
- Reportes de texto (son `f1-reporters`).
- Aprendizaje `learn` (f3).

## 3. Contrato

### Rule / Pack

```ts
type Severity = "error" | "warning" | "info";

interface SourceRef {
  title: string;
  url: string;
  section?: string;
}

type Matcher =
  | { all: Matcher[] }
  | { any: Matcher[] }
  | { not: Matcher }
  | AtomMatcher;

// Whitelist v1 — cada átomo declara op discriminante
type AtomMatcher =
  | { op: "method"; in: string[] }
  | { op: "pathMatches"; pattern: string; segmentIndex?: number | "last" }
  | { op: "pathSegmentPlural"; segmentIndex?: number | "last" }
  | { op: "pathHasPrefix"; prefix: string }
  | { op: "presentField"; field: OperationField }      // union literales
  | { op: "missingField"; field: OperationField }
  | { op: "responseMissing"; status: string }          // "404" | "4xx" | "5xx"
  | { op: "responsePresent"; status: string }
  | { op: "descriptionMinLength"; target: "summary" | "description" | "response"; min: number }
  | { op: "descriptionMatches"; target: "summary" | "description"; pattern: string }
  | { op: "operationIdRequired" }
  | { op: "operationIdPattern"; pattern: string }
  | { op: "securityMissing" }
  | { op: "headerRequired"; name: string; in?: "request" | "response" }
  | { op: "parameterNamingPattern"; pattern: string; in?: ParameterIn | "any" }
  | { op: "exampleRequired"; target: "operation" | "response"; status?: string }
  | { op: "sensitiveExample" }
  | { op: "deprecatedWithoutSunset" }
  | { op: "docFieldMissing"; field: "info.title" | "info.version" | "servers" | "components.schemas" }
  | { op: "specExtensionPresent"; name: string }       // x-sunset etc.
  | { op: "schemaInlineDepthMax"; max: number };       // hint PERF/SCHEMA

interface Rule {
  id: string;                      // /^[A-Z][A-Z0-9]*-\d{3}$/
  category: Category;              // taxonomy cerrada SDD 03 §4
  severity: Severity;
  message: string;
  when: Matcher;
  source?: SourceRef;              // requerido si pack.vía "elite" | pack.strictSource
  fix?: string;
  enabledByDefault?: boolean;      // default true
  deprecated?: boolean;
  packId: string;
  packVersion: string;
}

interface RulePack {
  id: string;                      // "elite"
  version: string;                 // "2026.09.1"
  rules: Rule[];
}
```

### Findings

```ts
interface Finding {
  fingerprint: string;
  ruleId: string;
  severity: Severity;              // ya con overrides aplicados
  category: Category;
  message: string;
  location: string;                // JSON Pointer al doc fuente
  apiLocation?: string;            // "GET /users/{id}"
  fix?: string;
  source?: SourceRef;
  packId: string;
  packVersion: string;
}
```

### Fingerprint (INV-5 base, estable)

```
sha256hex( ruleId + "|" + location + "|" + (apiLocation ?? "") + "|" + messageKey )
```

- `messageKey`: message con placeholders `{…}` eliminados y colapsado whitespace.
- No incluye severity ni packVersion (doc 03 §6).

### API

```ts
export interface EvaluateOptions {
  specs: Spec[];                   // f1 típicamente 1; multi soportado
  packs: RulePack[];
  customRules?: Rule[];            // de --rules / --rule (packId: "custom")
  disabledRuleIds?: Set<string>;
  severityOverrides?: Map<string, Severity>;
}

export function evaluate(opts: EvaluateOptions): EvaluationResult;

export interface EvaluationResult {
  findings: Finding[];             // orden estable
  errors: RuleEvalError[];         // regla rota / no soportada
}

export function sortFindings(findings: Finding[]): Finding[];
export function computeFingerprint(f: Omit<Finding, "fingerprint">): string;
export function validateRule(raw: unknown): { ok: true; rule: Rule } | { ok: false; issues: string[] };
export function validateMatcher(raw: unknown, path?: string): string[]; // issues
```

### Orden estable (INV-2)

Comparar por:

1. severity rank (`error=0, warning=1, info=2`)
2. `ruleId`
3. `apiLocation ?? ""`
4. `location`
5. `message`
6. `fingerprint` (tiebreak final)

### Semántica de evaluación

- Regla se evalúa **por scope**: átomos de operación se evalúan una vez por `Operation`; átomos de doc (ej. `docFieldMissing`) una vez por `Spec`.
- Implícito: si `when` contiene solo átomos de operación ⇒ scope `operation`. Mezcla doc+op ⇒ error de validación de regla (`MIXED_SCOPE`) — simplifica mensajes.
- Un finding por (rule × scope instance) cuando el matcher da true.
- `enabledByDefault: false` solo activa si config/custom la enciende.
- Regla con `deprecated: true` se salta (o emite info `RULE_DEPRECATED` una vez — f1: skip).

### DSL hardening (INV-4)

- JSON Schema o zod **estricto** (`.strict()`) para Rule y átomos.
- Patrones regex: compilados con timeout/step-limit o pre-validados con longitud máx (p.ej. 200 chars) y sin nested quantifiers peligrosos (lint de patrón en `validateRule`).
- Sin acceso a prototypes: walking con `Object.keys` + null-proto maps.
- Unknown `op` ⇒ issue, regla no corre (no default-ignore silencioso en packs elite; en custom ⇒ exit 2 del CLI).

### Overrides de severidad

- Aplicados **después** de evaluate, **antes** de sort: `severity = overrides.get(ruleId) ?? rule.severity`.
- `disabledRuleIds`: filtrar findings de esas reglas post-evaluate (o no evaluarlas — misma semántica f1).

## 4. Criterios de aceptación

- [ ] **AC-E.1** Fixture Spec + 1 regla atom true ⇒ exactamente 1 finding con fingerprint esperado (golden).
- [ ] **AC-E.2** Evaluar misma regla dos veces + sort ⇒ arrays deep-equal (INV-2).
- [ ] **AC-E.3** Orden de entrada de packs/rules invertido ⇒ mismo `findings` tras sort.
- [ ] **AC-E.4** Matcher desconocido ⇒ `validateRule` emite issue; `evaluate` con regla inválida la excluye de `findings` y la reporta en `errors` (o el CLI falla antes — f1: **falla antes** en load).
- [ ] **AC-E.5** `severityOverrides` cambia severity y **no** cambia fingerprint.
- [ ] **AC-E.6** `disabledRuleIds` ⇒ 0 findings de esa regla.
- [ ] **AC-E.7** Regex catastrófica candidata rechazada en `validateRule` (`UNSAFE_PATTERN`).
- [ ] **AC-E.8** No hay imports de `node:*` ni `fetch` en `@apigovscan/core` (lint AC de f0) — se mantiene.
- [ ] **AC-E.9** `all`/`any`/`not` anidados 3 niveles evalúan correctamente (tabla de verdad unitaria).
- [ ] **AC-E.10** Operación A true, B false ⇒ findings solo en A con `apiLocation` correcto.
- [ ] **AC-E.11** Performance smoke: 500 operaciones × 50 reglas < 500 ms en CI (medición orientativa, no flaky-hard).

## 5. Test plan

- Unit: cada átomo con true/false mínimo.
- Unit: combinadores.
- Unit: fingerprint golden strings.
- Unit: sort property (shuffle → mismo resultado).
- Unit: validateRule issues (unknown op, bad id, missing source cuando `strictSource`).
- No e2e (e2e es f1-analyze).

## 6. Dependencias

- `f0-foundation`
- Modelo `Spec` de `f1-openapi` (tipos)

## 7. Riesgos y decisiones abiertas

| Tema | Decisión f1 |
|---|---|
| Validador de rule schema | zod estricto (rápido, TS-first) |
| Átomos que crecen | whitelist versionada; atomos nuevos = minor del motor |
| Multi-spec en evaluate | soportado en tipos; e2e multi entra en analyze |
| Regex engine | validar patrones en load; evaluación con guard de length |

## Changelog

- 2026-09-23 · Spec creado desde SDD v1.0.
