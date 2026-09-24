# Tasks · f1-mvp

Plan: [plans/f1-mvp.md](../plans/f1-mvp.md) · Specs: `f1-openapi`, `f1-engine`, `f1-elite-pack`, `f1-analyze`, `f1-reporters`, `f1-invariants`

---

## M1.1 — OpenAPI → Spec (spec f1-openapi)

- [x] Spike YAML: lib `yaml@2.9.1` con `maxAliasCount` (AC-O.4) — decisión anotada abajo
- [x] `parseSpec`: size limit `maxBytes` (AC-O.5)
- [x] `parseSpec`: depth limit (AC-O.9)
- [x] `parseSpec`: alias limit (AC-O.4)
- [x] Rechazo de tags YAML no permitidos (mapeo `YAML_TAG_FORBIDDEN`)
- [x] Errores tipados (`ParseError` con code/message/pointer)
- [x] Detectar versión openapi 3.0.x / 3.1.x (AC-O.1, AC-O.2)
- [x] Soporte JSON input (AC-O.3)
- [x] `inputHash` sha256 bytes crudos (AC-O.10)
- [x] Normalizar operations: sort `(path, method)` (AC-O.11)
- [x] Merge path-level + op parameters (AC-O.13)
- [x] JSON Pointer al doc original en cada operation/response/parameter
- [x] `$ref` local: validados (remote/outside rechazados); expansión queda para engine
- [x] `$ref` remoto forbidden (AC-O.6)
- [x] Ciclo `$ref` ⇒ warning `REF_CYCLE`, no crash (AC-O.8)
- [x] Copiar `x-*` extensiones relevantes en operation (AC-O.14)
- [x] Swagger 2.0 ⇒ error claro `SWAGGER_20` (AC-O.12, §7)
- [x] Fixtures de ataque committeados + tests (16 AC-O tests)
- [x] Spec f1-openapi → todos AC-O verdes → estado `implementada`

**Decisión spike (M1.1):** parser YAML = paquete [`yaml`](https://eemeli.org/yaml/) v2 (`maxAliasCount` nativo + `uniqueKeys`); sin `@apidevtools/swagger-parser` (pesado, resolución remota).

---

## M1.2 — Engine + DSL (spec f1-engine)

- [x] Tipos `Rule`, `Matcher`, `Finding`, `RulePack`
- [x] zod strict para Rule y átomos (validación)
- [x] `validateRule` con issues (unknown op, id format, …)
- [x] Validación de regex inseguras (AC-E.7)
- [x] Scope detection doc vs operation (+ MIXED_SCOPE)
- [x] Átomos lote 1: `method`, `pathSegmentPlural`, `pathHasPrefix`, `pathMatches`, `missingField`, `presentField`, `responseMissing`, `responsePresent`, `descriptionMinLength`, `operationIdRequired`, `securityMissing` (mínimos para M1.3)
- [x] `evaluate()` + un finding por match (AC-E.1, AC-E.10)
- [x] Combinadores `all`/`any`/`not` (AC-E.9)
- [x] `computeFingerprint` golden (AC-E.1, INV-5)
- [x] `sortFindings` estable + shuffle invariants (AC-E.2, AC-E.3)
- [x] `severityOverrides` sin cambiar fingerprint (AC-E.5)
- [x] `disabledRuleIds` (AC-E.6)
- [x] Load falla ante regla inválida de pack (AC-E.4)
- [x] Performance smoke 500×50 (AC-E.11) — informativo
- [x] Confirmar lint core purity (AC-E.8)
- [x] Spec f1-engine → AC verdes → `implementada`

**Decisión (M1.2):** fingerprint sha256 implementado en TS puro (`sha256.ts`, sin `node:crypto`) para cumplir AC-E.8 + INV-3; átomos whitelist en `atoms.ts`; validador zod strict en `validate.ts`.

---

## M1.3 — Pack elite skeleton (parte de f1-elite-pack)

- [x] `packs/elite/pack.yaml` + `sources.yaml` + `CHANGELOG.md`
- [x] Loader de pack YAML → `Rule[]` con `packId/Version` (`loadPack` en core; FS en adapter/test)
- [x] Átomos extra si el gap analysis los pide (actualizar spec engine)
- [x] Reglas lote 1 (~10–15) del inventario con `source`:
  - [x] STRUCT-001, STRUCT-002, STRUCT-003
  - [x] NAMING-001, NAMING-003, NAMING-009
  - [x] DOCS-001, DOCS-004
  - [x] RESP-001
  - [x] ERR-001
  - [x] PARAM-001, PARAM-002
  - [x] AUTH-003
  - [x] SEC-002
- [x] Test: pack pasa `validateRule` todas
- [x] Test: `strictSource` — url presente

**Gap M1.3:** átomos nuevos + `Spec.components.securitySchemes` / `servers` poblados por el parser.

---

## M1.4 — Analyze e2e + reporters (specs f1-analyze, f1-reporters)

### Engine de reportes

- [x] `buildReport` + summary counts (AC-R.5)
- [x] Canonical JSON + `reportHash` (AC-R.1…R.4)
- [x] Omitir `meta` del hash (AC-R.2)
- [x] `formatConsole` (AC-R.6: sin ANSI con color false)
- [x] `formatJson` pretty/compact según contrato
- [x] Redacción de secretos en output (AC-R.8)
- [x] `packs` sort por id (AC-R.10)
- [x] Unit tests + snapshot console

### Caso de uso + CLI

- [x] Ports: `SpecLoader`, `PackRepository`, `ReportSink`
- [x] `analyzeUseCase` orquestación (etapas debug)
- [x] Adapter FS loader
- [x] Adapter pack embebido (walk-up `packs/elite`)
- [x] Parser argv: flags de spec f1-analyze **solo**
- [x] Exit codes 0/1/2 (AC-A.5, AC-A.6, AC-A.7)
- [x] Config `apigovscan.yaml` (`failOn`, `rules` off/override) (AC-A.8)
- [x] Discovery directorio orden estable (AC-A.9, AC-A.13)
- [x] stdin `-` (AC-A.10)
- [x] `--output` file behavior (AC-A.11)
- [x] `--debug` sin body largo (AC-A.12)
- [x] `--no-color` + `NO_COLOR` (AC-R.7)
- [x] e2e: happy path (AC-A.1)
- [x] e2e: determinismo double run `reportHash` (AC-A.2, INV-2)
- [x] e2e: red blocked (AC-A.3, INV-1)
- [x] e2e: `--format json` schema (AC-A.4)
- [x] Spec f1-analyze + f1-reporters → `implementada`

---

## M1.5 — Pack full + invariants + cierre

### Pack ≥ 50

- [x] Completar inventario de spec f1-elite-pack (ids faltantes)
- [x] Gap analysis átomos → engine PRs
- [x] Fixtures públicos committeados + thresholds ruido (AC-P.6)
- [x] Test count ≥ 50 activas (AC-P.1)
- [x] Test 100% source.url (AC-P.2)
- [x] Test ids únicos + formato (AC-P.3)
- [x] validateRule all (AC-P.4)
- [x] Inventario vs CHANGELOG (AC-P.5)
- [x] CHANGELOG 2026.09.1 con impacto por severidad (AC-P.7)
- [x] Pack embebido sin red (AC-P.8)
- [x] `explain(ruleId)` unit + uso desde CLI `rules explain` (AC-P.9)
- [x] Messages EN literales (AC-P.10)

### Invariants suite

- [x] `no-network.test` INV-1 + e2e preload (AC-I.1)
- [x] `determinism.test` INV-2
- [x] `core-purity` / banned imports INV-3
- [x] `no-eval` INV-4
- [x] `fingerprint/sort` INV-5 mínimo f1
- [x] `report packs version` INV-6
- [x] `fs-boundary` INV-7
- [x] `pack-embed` test
- [x] CI job `invariants` en matriz OS (AC-I.1, AC-I.2 documentado)
- [x] Spec f1-elite-pack + f1-invariants → `implementada`

### Cierre fase 1

- [x] Performance: spec 1 MB < 2 s p95 — medir, anotar resultado
- [x] README quickstart (`pnpm dlx` / bin local + ejemplos)
- [ ] Tag `v0.1.0-mvp`
- [x] Revisar DoD de plans/f1-mvp.md
- [x] Actualizar estado de specs f1 en specs/README.md
