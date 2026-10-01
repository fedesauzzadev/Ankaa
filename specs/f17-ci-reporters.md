# f17-ci-reporters · Paridad CI enterprise: junit, checkstyle, codequality + recetas

| Campo     | Valor                                 |
| --------- | ------------------------------------- |
| Estado    | implementada                                       |
| Fase      | 17                                    |
| Fecha     | 2026-09-30                            |
| Deriva de | [f5-reporters](f5-reporters.md) (cerrada); INV-2 |

## 1. Objetivo / user story

Como equipo con Jenkins, GitLab o Azure DevOps (no GitHub), quiero reportes
que mis pipelines ya consumen (JUnit XML, Checkstyle, CodeQuality de GitLab) y
recetas listas para copiar, para que Ankaa no me fuerce a cambiar de CI.

## 2. Alcance (in / out)

### In

- `--format junit`: `<testsuite>` por spec, `<testcase>` por finding
  (error → `<error>`, warning → `<failure>`), **sin timestamps** (INV-2).
- `--format checkstyle`: XML con file/line/col/severity/message/`source=ruleId`.
- `--format codequality`: JSON CodeClimate / GitLab CodeQuality.
- `examples/ci/`: `gitlab-ci.yml`, `azure-pipelines.yml`, `Jenkinsfile` con
  publicación de reportes como artifacts.

### Out

- Red; HTML interactivo; cambios en el análisis (solo salida).
- Soporte de pipelines que requieran tokens o servicios externos.

## 3. Contrato (interfaces, schemas, UX)

- Mismos flags `--output`/`--fail-on`; mismos exit codes que los reporters
  existentes.
- Determinismo byte-estable (snapshots); orden = orden canónico de findings.
- line/col: si no existe mapper pointer → posición, emitir `line="1"` con el
  pointer en el message (decisión §8.6); nunca inventar posiciones.
- Schemas pineados (decisión del dueño 2026-10-01, sin fetch de DTDs — INV-1):
  - **junit**: XML "testsuite clásico" estilo JUnit 4 (el que consumen Jenkins
    y GitLab CI y emiten pytest/jest): `<testsuites>` raíz, `<testsuite>` por
    spec de entrada, `<testcase>` por finding — severity `error` → `<error>`,
    `warning` → `<failure>`, `info` → `<skipped>` — **sin `timestamp` ni
    `time`** (INV-2).
  - **checkstyle**: XML estilo Checkstyle 8.x (`<checkstyle version="ankaa/<v>">`,
    `<file name>`, `<error line column severity message source=ruleId/>`);
    fallback `line="1" column="1"` + pointer en message hasta M17.7b.
  - **codequality**: CodeClimate/GitLab CodeQuality (array JSON con
    `description/check_name/fingerprint/severity/location.path/location.lines.begin`);
    severity map `error→critical`, `warning→major`, `info→minor`;
    `fingerprint` = fingerprint del finding (dedupe estable en GitLab).
- Agrupación por spec de entrada: misma regla que `artifactUri` de SARIF
  (`label#pointer` en multi-input).

## 4. Criterios de aceptación (preliminares)

- [x] AC-CI.1 XML/JSON válidos y parseables contra schemas de referencia.
- [x] AC-CI.2 e2e exit codes por formato.
- [x] AC-CI.3 Snapshots deterministas: dos corridas → bytes idénticos.
- [x] AC-CI.4 Recetas de `examples/ci/` corren el CLI y publican artifacts.
- [x] AC-CI.5 `pnpm check` e invariantes verdes.

## 5. Test plan

- Fixtures multi-spec; validación de schemas; e2e CLI; snapshots.

## 6. Dependencias

- `f5-reporters` (cerrada): infraestructura de formatos.

## 7. Riesgos y decisiones abiertas

- Mapper pointer → line/col: resuelto (§8.6, A→B escalonado).
- Schemas JUnit/Checkstyle: pineados (§3, decisión del dueño 2026-10-01).

## 8. Análisis de viabilidad · mapper pointer → line/col (2026-10-01)

Responde la decisión §5.7 del [plan f17](../plans/f17-diferenciales.md).
Evidencia de spike ejecutado contra `yaml` 2.9.1 (la dep **ya** usada por
`@ankaa/openapi`; cero deps nuevas).

### 8.1 Estado actual

- `parse.ts` usa `parse()` de `yaml`, que descarta posiciones. La misma lib
  ofrece `parseDocument()` + `doc.toJS()`: conserva el CST con `range`
  (offsets start/end) por nodo a costo equivalente.
- `Finding.location` es un JSON pointer string; el reporte SARIF hoy emite
  solo `artifactLocation.uri` sin `region` — nadie consume line/col todavía.

### 8.2 Mecánica validada (spike)

1. `parseDocument(text)` → resolver pointer por path con `node.get(key, true)`
   (O(profundidad)); el nodo trae `range[0]` (offset).
2. Offset → line/col con índice de inicios de línea (1 pasada O(n) + búsqueda
   binaria). Determinista (INV-2): mismo input ⇒ mismas posiciones.
3. Resultados medidos sobre fixture: `…/operationId` → línea 8 col 20;
   `…/parameters/0/schema` → línea 13 col 13; `…/responses/200/description`
   → línea 16 col 24. Sin errores ni warnings del parser extra.

### 8.3 Edge cases encontrados (a documentar en la implementación)

| Caso | Comportamiento | Mitigación |
| --- | --- | --- |
| Token numérico (`/responses/200`) | Es **clave string** en maps e índice en seqs | Resolver según tipo del nodo padre (detectado y corregido en el spike) |
| Posición del nodo | `range` apunta al inicio del **valor** (mapa anidado ⇒ su primera clave) | v1 acepta valor; apuntar a la clave requiere iterar Pairs (follow-up) |
| Anchors/aliases | El CST apunta a la definición del anchor | Posición = primera definición (aceptable, documentado) |
| Entradas JSON | `JSON.parse` no preserva posiciones | Fallback §3 (`line="1"` + pointer en message); scanner propio fuera de v0 |

### 8.4 Opciones

| Op | Qué | Costo est. | Valor checkstyle |
| -- | --- | ---------- | ---------------- |
| A | Solo fallback: `line="1"` + pointer en message (§3) | ~0 | Bajo (sin inline en Jenkins warnings-ng) |
| B | Mapper YAML en `@ankaa/openapi`: side-table pointer→{line,col} construida en parse (`parseDocument`), viaja en `Spec`; reporters la consumen si existe | ~150–250 LOC + tests + **cambiar modelo `Spec` (spec `f1-openapi` primero)** | Alto (YAML = mayoría de specs) |
| C | B + mini-scanner JSON propio para posiciones | +~100–150 LOC | Marginal (pocas specs JSON) |

Invariantes: A/B/C cumplen INV-1 (offline), INV-2 (offsets del CST
deterministas), INV-7 (sin FS extra). B/C tocan contrato público de `Spec` →
regla de oro: editar `specs/f1-openapi.md` antes del código.

### 8.5 Recomendación

**A → B escalonado**: M17.7a implementa junit + codequality + checkstyle con
fallback A (junit/codequality no necesitan line/col ⇒ valor inmediato sin
tocar el parser); M17.7b agrega el mapper B solo si la adopción real de
checkstyle exige inline (side-benefit: SARIF gana `region.startLine` y las
anotaciones de GitHub mejoran). C queda out salvo demanda explícita.

### 8.6 Decisión del dueño (2026-10-01)

**A→B escalonado**: M17.7a junit + codequality + checkstyle con fallback A;
M17.7b mapper B (YAML only, JSON queda en fallback) cuando la adopción real
de checkstyle lo exija. C queda out salvo demanda explícita.

## Changelog

- 2026-09-30: draft inicial desde el backlog f17
  ([plan](../plans/f17-diferenciales.md)).
- 2026-10-01: análisis de viabilidad del mapper pointer → line/col (§8) con
  spike sobre `yaml` 2.9.1 — viable y barato para YAML (misma dep), fallback
  para JSON; recomendación A→B escalonado. Decisión del dueño pendiente.
- 2026-10-01: dueño decide **A→B escalonado** (§8.6): M17.7a reporters con
  fallback, M17.7b mapper YAML a demanda. Pendiente para `ready`: pinnear
  schemas JUnit/Checkstyle (§7).
- 2026-10-01: dueño pinnear schemas (§3): junit 4-style sin timestamps,
  checkstyle 8.x-style con fallback line/column="1", codequality CodeClimate
  con fingerprint del finding → spec `ready` para M17.7a.
- 2026-10-01: M17.7a implementado: `formatJunit`/`formatCheckstyle`/
  `formatCodequality` + `locationParts` en `@ankaa/reporters`, `--format
  junit|checkstyle|codequality` en el CLI, recetas `examples/ci/` y 15 tests
  (AC-CI.1..5) → `implementada`. M17.7b (mapper YAML) queda a demanda.
