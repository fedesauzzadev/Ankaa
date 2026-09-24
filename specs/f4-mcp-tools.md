# f4-mcp-tools · Tools MCP de análisis y consulta

| Campo | Valor |
|---|---|
| Estado | ready |
| Fase | 4 |
| Deriva de | SDD FR-50/FR-51, scenario S5; doc 01 §6.6, doc 03 reglas; specs `f4-mcp-server`, `f1-analyze`, `f2-custom-rules` |
| Roadmap | Fase 4 — MCP stdio local |

## 1. Objetivo

Como **agente LLM local**, quiero los mismos tools del CLI (`analyze_spec`, `list_rules`, `explain_rule`, `validate_custom_rules`, `explain_finding`) con semántica idéntica, para gobernar APIs sobre el repo abierto sin 0 tokens de ApiGovScan.

**User story canónica (S5):**

> Given el repo abierto y el server MCP corriendo,  
> When el cliente llama `analyze_spec` sobre un spec y luego `explain_finding` (o `explain_rule`),  
> Then obtiene findings + cita de la guía (ej. NAMING-004 → Google API Design Guide) — **0 tokens ApiGovScan**.

## 2. Alcance

### Dentro

- Implementación de los 5 handlers (FR-50) en **CLI wiring** (usa `analyzeUseCase`, loaders, `validateRulesFiles`, core `explain`/`explainRule`).
- Paridad de semántica con CLI (FR-51): mismos packs, config `apigovscan.yaml` si está en cwd, skills/baseline **si** el path de config lo resuelve igual que analyze (default: respetar config y skills igual que `analyze` sobre ese archivo).
- Output JSON estable y determinista (INV-2) para el mismo input.
- `explain_finding`: lee report JSON en disco (`reportPath`), localiza finding por `fingerprint`, adjunta `explain(ruleId)` del pack correspondiente.
- Errores: `ok: false` + `error` legible (EN), `isError: true` en MCP.

### Fuera

- Tools de escritura (`learn`, `init`, `write-baseline`).
- MCP remoto / packs de registry (fase 6).
- Streaming / progress notifications.
- Multiples specs en un solo `analyze_spec` (v1 = un path archivo; directorio → error o discover limit — decisión §7: **archivo o directorio con discover como CLI**).

## 3. Contrato

### `analyze_spec`

```
input:  { path: string, failOn?: FailOn, rules?: string[] }
output: {
  ok: boolean,
  error?: string,
  toolVersion: string,
  packs?: [{ id, version }],
  summary?: { total, error, warning, info },
  findings?: Array<{ fingerprint, ruleId, severity, message, location, fix?, source? }>,  // top N
  totalFindings?: number,
  truncated?: boolean,
  suppressed?: number,
  skillsSuppressed?: number,
  note?: string
}
```

- Mismo pipeline que `runAnalyze` (config → skills → baseline → evaluate → report).
- `failOn` solo afecta `exit`-like semantics del payload (`gate: { failOn, failed }`), no lanza exit del server.
- Orden de findings = orden canónico del report (INV-2).

### `list_rules`

```
input:  { rules?: string[] }   // custom files opcional
output: { ok, rules: [{ id, severity, category, message, enabled, packId?, source? }] }
```

- Pack activo (elite embebido) + custom si `rules` dado; mismas reglas que `rules list`.

### `explain_rule`

```
input:  { ruleId: string, rules?: string[] }
output: { ok, error?, explanation: { ruleId, message, fix?, source?, severity, category, packId, packVersion } }
```

- Busca en custom (`rules` files) primero y en pack — misma precedencia que `rules explain`.

### `validate_custom_rules`

```
input:  { files: string[] }
output: { ok, files: [{ file, ok, ruleCount, errors, structuralError? }] }
```

- Delega a `validateRulesFiles` (f2). Paths sandboxed.

### `explain_finding`

```
input:  { reportPath: string, fingerprint: string }
output: {
  ok, error?,
  finding?: { fingerprint, ruleId, severity, message, location, ... },
  explanation?: { message, fix?, source?, severity, category, packId, packVersion }
}
```

- `reportPath` = report JSON generado por CLI (`--format json --output`) o por un `analyze_spec` previo del cliente (el cliente reenvía path; stateless).
- Si fingerprint no está → `ok: false`, `error: "finding not found: <fp>"`.
- Si rule no se encuentra en packs activos → finding sin explanation, `ok: true` con flag.

## 4. Criterios de aceptación

- [ ] **AC-T.1** `analyze_spec` sobre fixture con findings ⇒ payload con `summary`, findings ordenados, fingerprints presentes.
- [ ] **AC-T.2** `analyze_spec` >20 findings ⇒ `truncated: true`, `totalFindings` correcto, longitud findings = 20.
- [ ] **AC-T.3** `analyze_spec` falla (spec malformado) ⇒ `ok: false`, `isError`, mensaje parse errors.
- [ ] **AC-T.4** `list_rules` ⇒ incluye ≥1 regla elite conocida (ej. NAMING-004) con severity/message.
- [ ] **AC-T.5** `explain_rule` NAMING-004 ⇒ source/fix presente (cita guide) — cubre S5 parcial.
- [ ] **AC-T.6** `explain_rule` id inexistente ⇒ `ok: false`.
- [ ] **AC-T.7** `validate_custom_rules` archivo válido ⇒ `ok: true`, ruleCount ≥1; inválido ⇒ errors con issues.
- [ ] **AC-T.8** `explain_finding` con report del CLI + fingerprint ⇒ finding + explanation con source.
- [ ] **AC-T.9** fingerprint inexistente ⇒ `ok: false`.
- [ ] **AC-T.10** Paridad: mismo spec por CLI `analyze --format json` y `analyze_spec` ⇒ mismos fingerprints/summary (ignorando durationMs).
- [ ] **AC-T.11** Config/skills en cwd respetados igual que CLI (o documentado si v1 simplifica — decisión §7).

## 5. Test plan

| Caso | Tipo |
|---|---|
| Cada tool happy path | unit (handlers con FS fixtures) |
| Truncación | unit |
| Paridad CLI vs tool | e2e (mismo fixture) |
| explain_finding roundtrip | e2e (CLI --output → tool) |
| Errores | unit |

## 6. Dependencias

- `f4-mcp-server` (transporte + sandbox).
- `f1-analyze`, `f2-config`, `f2-custom-rules`, `f3-skills` (pipeline).

## 7. Riesgos y decisiones abiertas

| Tema | Decisión |
|---|---|
| Config/skills en MCP | **v1: sí** — handlers cargan config igual que CLI desde cwd del server; si rompe complejidad, flag `--no-config` después. |
| Directorio en analyze_spec | Igual que CLI: discover `openapi*/swagger*`; vacío → ok con 0 findings o error — alinear con `discoverSpecs`. |
| Report para explain_finding | Cliente debe generar report (CLI o guardarlo); tool no re-análiza salvo path inválido → error claro. |
| source en findings | Solo si el pack ya lo expone en finding/`explain`; no inventar campos. |

## Changelog

- 2026-09-24 · Spec creado desde FR-50 + S5 + paridad f1/f2/f3.
