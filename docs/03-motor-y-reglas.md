# 03 · Motor y reglas

ApiGovScan · SDD · v1.0

---

## 1. Filosofía del motor

El motor es una **máquina determinista de detectar deuda de diseño en specs**, no un "asistente" ni un linter de código. Tres reglas de diseño:

1. **0 tokens:** ningún path obligatorio invoca un LLM (INV-3).
2. **Explicable:** todo finding se explica con regla + mensaje + cita (P4).
3. **Ajustable sin forkear:** severidades, suppressions y reglas custom viven fuera del binario (skills + config + `--rules`).

## 2. Modelo de una regla

```yaml
# packs/elite/2026.09.1/rules/naming.yaml
pack: elite
version: 2026.09.1
rules:
  - id: NAMING-001
    category: naming
    severity: error
    message: >
      Resource path segments should be plural nouns (e.g. /users not /user).
    fix: >
      Rename the segment to the plural form; keep query params singular if needed.
    source:
      title: Microsoft REST API Guidelines
      url: https://github.com/microsoft/api-guidelines
      section: "2.2 URI Paths"
    when:
      all:
        - op: pathSegmentPlural
          segmentIndex: -1   # último segmento de path fijo (no template)
```

### Campos obligatorios (schema estricto, falla el pack si falta)

| Campo | Descripción |
|---|---|
| `id` | `CATEGORIA-NNN` único globalmente en un release del pack |
| `category` | taxonomy cerrada (ver §4) |
| `severity` | `error` \| `warning` \| `info` |
| `message` | texto EN, una oración, sin findings dinámicos (placeholders `{}` opcionales) |
| `when` | árbol DSL (§3) |
| `source` | **obligatorio en packs elite**; `title` + `url` (+ `section` opcional) |

Opcionales: `fix`, `deprecated`, `enabledByDefault`, `since`, `related` (ids).

## 3. DSL de reglas (declarativa, whitelist)

**Objetivo:** que un tech lead escriba una regla en YAML en 2 minutos sin tocar TypeScript, sin ejecutar código arbitrario (INV-4).

### Constructores soportados (whitelist v1)

**Combinadores:** `all`, `any`, `not`

**Sobre operaciones / paths:**

| Constructor | Sentido |
|---|---|
| `method` | método HTTP igual a / en lista |
| `pathMatches` | regex **segura** sobre path (timeout + sin backtracking catastrófico; ver 06) |
| `pathSegmentPlural` | último/índice de segmento es plural |
| `pathHasPrefix` | prefijo (versionado `/v1/…`) |
| `missingField` / `presentField` | campo en operation/parameter/response |
| `responseMissing` | status code ausente en `responses` |
| `schemaRefStyle` | `$ref` vs inline (política del equipo) |

**Sobre calidad de docs:**

| Constructor | Sentido |
|---|---|
| `descriptionMinLength` | `summary`/`description` con longitud mínima |
| `descriptionMatches` | regex en description |
| `exampleRequired` | ejemplos presentes en schema/operation |
| `operationIdRequired` / `operationIdPattern` | operationId y su formato |

**Sobre seguridad y errores:**

| Constructor | Sentido |
|---|---|
| `securityMissing` | operación sin `security` (o sin global) |
| `errorResponseMissing` | sin 4xx documentado |
| `errorSchemaShape` | error body sin shape esperado (pair title/detail o problem+json) |
| `sensitiveExample` | ejemplos que parecen secretos (patrones) → finding + redacción |

**Sobre headers/params/paginación:**

| Constructor | Sentido |
|---|---|
| `missingHeader` / `headerRequired` | presencia de `x-request-id`, `traceparent`, etc. |
| `paginationStyle` | list operations con estilo de paginación soportado |
| `parameterNamingPattern` | naming de query params (camel/snake case policy) |

**Sobre versionado/deprecación:**

| Constructor | Sentido |
|---|---|
| `deprecatedWithoutSunset` | `deprecated: true` sin `x-sunset` / header documentado |
| `versioningStyle` | política de versión (path vs media type vs header) |

**Scope:** cada `when` evalúa contra `Spec` completo o contra cada `Operation` (implícito por constructor). No hay variables mutables, ni loops, ni acceso a red/FS/disco.

### Ejemplo con combinadores

```yaml
- id: ERR-010
  category: errors
  severity: warning
  message: "Write operations should document at least one 4xx response."
  source: { title: "Zalando RESTful API Guidelines", url: "https://opensource.zalando.com/restful-api-guidelines/" }
  when:
    all:
      - op: method
        in: [post, put, patch, delete]
      - not:
          op: responseMissing
          statusClass: 4xx
```

### Reglas custom del usuario

```bash
apigovscan analyze ./openapi.yaml --rules ./team-rules.yaml
apigovscan analyze ./openapi.yaml --rule '{"id":"TEAM-001","severity":"error","when":{"op":"headerRequired","name":"x-request-id"},"message":"Every operation must accept x-request-id."}'
```

- Mismo schema que las del pack; `id` debe ser nuevo o chocar con override explícito (error en CLI, no merge silencioso).
- Validación al cargar: `apigovscan rules validate ./team-rules.yaml`.

## 4. Taxonomía de categorías (cerrada en v1)

`naming` · `structure` · `docs` · `errors` · `security` · `versioning` · `pagination` · `parameters` · `schemas` · `deprecation` · `consistency` · `performance` (hints) · `custom` (reglas de usuario)

Categorías nuevas = cambio de minor del motor (documentado), no string libre.

## 5. Severidades y `failOn`

| Severidad | Uso típico | Default `failOn` |
|---|---|---|
| `error` | Rompe integración o seguridad clara | sí |
| `warning` | Deuda que debería arreglarse | no |
| `info` | Estilo / hint | no |

Config:

```yaml
# apigovscan.yaml
failOn: error
rules:
  NAMING-001: off
  ERR-010: error   # subir severidad local
```

## 6. Pipeline de evaluación

```
raw bytes
  → parse (YAML/JSON hardening)          # limits ver 06
  → normalize → Spec (modelo interno)
  → load packs (embebidos + locales + pin)
  → load skills (suppressions, overrides, drafts)
  → load config + CLI overrides
  → evaluate: rules × Spec → raw findings
  → dedupe (mismo fingerprint conserva mayor severidad de override)
  → apply skills (suppress / re-enumera)
  → sort estable (INV-2)
  → apply baseline filter
  → compute counts + inputHash + packsVersion
  → build report (console/json/…)
```

### Orden estable (INV-2)

Sort por tuple: `(severityRank, ruleId, apiLocation?, location, message)` — todo string-comparable, sin depender de orden de iteración de objetos JS.

### Fingerprint (identidad del finding)

```
fingerprint = sha256(
  ruleId + "|" +
  location + "|" +           # JSON Pointer
  apiLocation + "|" +        # "GET /users/{id}" o vacío
  messageKey                  # message sin placeholders dinámicos
)
```

El fingerprint **no** incluye severity (permite `severity_change` sin cambiar identidad) ni pack version (la misma regla en upgrade sigue siendo "la misma" para suppressions; si el mensaje cambia mayорmente, se documenta como breaking del pack).

## 7. Determinismo (INV-2) — checklist implementable

- [ ] Sin `Date.now()` / `Math.random()` en core; clock solo en adapter de metadata (`run.startedAt` **fuera** del hash).
- [ ] JSON.stringify con claves ordenadas en reporte canónico.
- [ ] Orden de findings por tuple fija (§6).
- [ ] Regex del motor con flags fijos; sin `lastIndex` stateful compartido.
- [ ] `inputHash` = sha256 de bytes crudos del spec (antes de parse).
- [ ] Snapshot test: dos corridas → deep equal; orden inverso de load de skills → igual reporte.
- [ ] Documentar exclusiones: `meta.durationMs` no participa del hash de findings.

`reportHash` = sha256 del canónico JSON de `findings + counts + packs + engineVersion` — se imprime al final del console y va en el JSON.

## 8. Skills (aprendizaje en git)

### Estructura

```
.apigovscan/
├── config.yaml          # o apigovscan.yaml en raíz del repo (ver 01)
├── skills/
│   ├── suppressions.yaml
│   ├── severities.yaml
│   ├── drafts/          # reglas candidatas (draft: true)
│   │   └── TEAM-001.yaml
│   └── README.md        # generado por init, explica el flujo
├── baseline.json
└── feedback/            # opcional: histórico de feedback aplicado
    └── 2026-09-23.json
```

### suppressions.yaml

```yaml
version: 1
suppressions:
  - fingerprint: "ab12…"           # exacta
    reason: "Legacy endpoint frozen until v2 migration"
    by: "lead@team"                 # opcional, string libre
    createdAt: "2026-09-23"         # metadata; no afecta eval
  - match:                          # query (más amplia, con cuidado)
      ruleId: NAMING-001
      apiPath: "^/legacy/"
    reason: "Legacy namespace excluded from naming policy"
```

### severities.yaml

```yaml
version: 1
overrides:
  - ruleId: PAGINATION-001
    severity: error
```

### drafts/

```yaml
id: TEAM-007
draft: true
category: custom
severity: warning
message: "Batch endpoints must document max array size."
when:
  all:
    - op: method
      in: [post]
    - op: pathMatches
      pattern: "/batch$"
source:
  title: "Derived from feedback (learn)"
  url: ""        # vacío permitido solo en draft; bloquea promoción a elite
```

Drafts **no** se evalúan hasta `learn --promote TEAM-007` (mueve a `custom` activo) o edición manual con `draft: false` en config del equipo.

## 9. `learn` — flujo y semántica

```
Input:  report.json  +  feedback.json
Output: patch idempotente sobre .apigovscan/skills/
```

### feedback.json (schema)

```json
{
  "reportHash": "…",
  "items": [
    { "fingerprint": "…", "decision": "false_positive", "comment": "internal only" },
    { "fingerprint": "…", "decision": "wontfix", "comment": "migrate in Q4" },
    { "fingerprint": "…", "decision": "severity_change", "severity": "info" },
    { "fingerprint": "…", "decision": "confirm" },
    { "fingerprint": "…", "decision": "suggest_rule", "draft": { "id": "TEAM-008", "when": { "op": "headerRequired", "name": "x-batch-limit" }, "message": "…" } }
  ]
}
```

### Mapeo decision → skills

| decision | efecto |
|---|---|
| `false_positive` | upsert suppression por fingerprint con `reason` obligatorio |
| `wontfix` | suppression con reason (deuda aceptada) |
| `severity_change` | upsert override de severidad para ese `ruleId` (global) o scoped por fingerprint (opción `scope: finding`) |
| `confirm` | no cambia skills; cuenta en `feedback/` histórico (métrica futura) |
| `suggest_rule` | escribe `skills/drafts/<id>.yaml` con `draft: true` |

### Idempotencia (INV-5)

- Suppressions upserteadas por clave (`fingerprint` o `match` canónico).
- Re-aplicar el mismo feedback → mismo YAML (orden estable de listas).
- `reportHash` distinto no invalida learn: se emiten warnings si el fingerprint no aparece en el reporte dado (posible spec cambió), pero el upsert igual aplica por fingerprint.

### Promoción de drafts a reglas activas

```bash
apigovscan skills promote TEAM-007     # draft → activa (custom pack local)
apigovscan skills list
```

Promover a pack **elite** requiere PR al repo ApiGovScan + fuente real (drafts sin `source.url` no entran).

## 10. Baseline

```json
{
  "version": 1,
  "inputHash": "sha256:…",
  "engineVersion": "1.0.0",
  "packs": [{ "id": "elite", "version": "2026.09.1" }],
  "fingerprints": ["…", "…"]
}
```

- `--write-baseline` reemplaza el archivo (con backup si existe y `--force` no).
- `--baseline` filtra findings cuyo fingerprint esté en la lista.
- Si `inputHash` difiere: warning + sigue (spec evolucionó; fingerprints filtrados simplemente no matchean); `--strict-hash` para fallar.

## 11. Reportes

### console (resumen típico)

```
ApiGovScan 1.0.0 · packs elite@2026.09.1 · input sha256:9f3a… · 1.2s

error  NAMING-001  GET /user/{id}
       Resource path segments should be plural nouns.
       fix: rename to /users/{id}
       ↳ Microsoft REST API Guidelines §2.2
       https://github.com/microsoft/api-guidelines#22-uri-paths

warning ERR-010  POST /payments
       Write operations should document at least one 4xx response.
       ↳ Zalando RESTful API Guidelines

… 
✖ 2 errors · 14 warnings · 3 info  (baseline: 11 suppressed)  reportHash 6c1e…
```

### JSON (canónico, estable)

```json
{
  "tool": { "name": "apigovscan", "version": "1.0.0" },
  "packs": [{ "id": "elite", "version": "2026.09.1" }],
  "input": { "path": "specs/payments.yaml", "sha256": "…" },
  "summary": { "error": 2, "warning": 14, "info": 3, "suppressed": 11 },
  "findings": [
    {
      "fingerprint": "…",
      "ruleId": "NAMING-001",
      "severity": "error",
      "category": "naming",
      "message": "…",
      "location": "/paths/~1user~1{id}/get",
      "apiLocation": "GET /user/{id}",
      "fix": "…",
      "source": { "title": "…", "url": "…", "section": "…" }
    }
  ],
  "meta": { "durationMs": 1180, "startedAt": "2026-09-23T…" }
}
```

`reportHash` = sha256 del canónico **sin** `meta`.

## 12. Extensibilidad futura (no v1)

| Idea | Condición de entrada |
|---|---|
| Rules como módulos TS externos | Solo packs oficiales versionados (rompe INV-4 si es arbitrario) |
| Matchers CEL | Si YAML DSL se queda corto en 2+ equipos reales |
| LLM `--explain-friendly` | Paquete aparte opt-in, nunca en core ni CI default |
| Rules de organización (multi-repo) | Cliente remoto de packs internos self-host (compose) |

---

*Continuar: [04-estandares.md](04-estandares.md).*
