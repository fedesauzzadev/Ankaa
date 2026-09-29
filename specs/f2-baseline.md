# f2-baseline · Baseline de deuda existente

| Campo     | Valor                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                   |
| Fase      | 2                                                                                                         |
| Deriva de | SDD FR-20…FR-22, doc 03 §10, escenario S2; specs `f1-engine` (fingerprints), `f1-analyze`, `f1-reporters` |
| Roadmap   | Fase 2 — Criterio de salida: solo falla lo nuevo                                                          |

## 1. Objetivo

Como **tech lead** de un proyecto con deuda, quiero congelar los findings actuales en un baseline versionable, para que CI pase en main y **solo bloqueen findings nuevos** en PRs.

**User story canónica:**

> Given un spec con 40 warnings heredados y `apigovscan analyze --write-baseline`,  
> When alguien mergea ese baseline y luego agrega un endpoint con un error nuevo,  
> Then `analyze --baseline` filtra los 40 viejos, reporta el nuevo, y exit 1 solo por lo nuevo.

## 2. Alcance

### Dentro

- Flag `--write-baseline` (y `--baseline-path`, `--force`).
- Flag `--baseline` (y `--strict-hash`, `--baseline-ignore-hash`).
- Config `baseline: { enabled, path, strictHash }` (ver `f2-config`).
- Formato de archivo `baseline.json` (schema versionado).
- Filtro post-evaluate / pre-orden-reporte por fingerprint set.
- Conteo `summary.suppressed` (campo opcional ya previsto en `f1-reporters`).
- Línea de console: `(baseline: N suppressed)`.
- Compatibilidad de `inputHash` (warning por default; `--strict-hash` ⇒ exit 2).
- Escritura solo en path baseline (INV-7: output explícito / `.apigovscan/`).

### Fuera

- Skills suppressions (fingerprint con reason, query match) → **f3** (baseline ≠ skills).
- Auto-write en CI / Action → f5.
- Multi-spec baselines consolidados → ver contrato multi-input (abajo: decisión).
- Diff de baseline / `baseline show` → nice-to-have, no gate de fase.

## 3. Contrato

### Formato `baseline.json`

```json
{
  "version": 1,
  "createdAt": "2026-09-24T12:00:00.000Z",
  "tool": { "name": "apigovscan", "version": "0.1.0" },
  "engineVersion": "1.0.0",
  "packs": [{ "id": "elite", "version": "2026.09.1" }],
  "inputs": [{ "path": "specs/payments.yaml", "sha256": "sha256:9f3a…" }],
  "fingerprints": ["…", "…"],
  "counts": { "error": 2, "warning": 14, "info": 3, "total": 19 }
}
```

- `fingerprints`: sort lexicográfico único (determinismo).
- `createdAt` **no** participa de ningún hash de reporte; al reescribir cambia.
- `version: 1` — parser rechaza mayor version conocida con mensaje claro.
- Archivo newline final `\n`, key order estable (canonical helpers si existen).

### Flags analyze

| Flag                     | Significado                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--write-baseline`       | Evalúa, escribe baseline con todos los findings del run actual, **no** escribe reporte por defecto (o escribe igual? → decisión abajo)                         |
| `--baseline`             | Carga baseline y filtra findings cuyo fingerprint ∈ set                                                                                                        |
| `--baseline-path <file>` | Ruta custom (default `.apigovscan/baseline.json`)                                                                                                              |
| `--force`                | Con `--write-baseline`, pisa sin backup                                                                                                                        |
| `--strict-hash`          | `inputHash` mismatch ⇒ exit 2                                                                                                                                  |
| `--baseline-ignore-hash` | No warning ni falla por hash mismatch (equivale default no-strict con silencio? → **decisión:** default = warning; ignore-hash = sin warning; strict = exit 2) |

**Decisión `--write-baseline` + report:** el reporte **sí** se emite igual (console/json) además de escribir baseline; exit code calculado **antes** de escribir o con los findings completos (sin filtrar — no hay baseline read en ese run). Motivo: el dev ve qué se congeló.

**Decisión multi-input (directorio):** un **único** baseline.json que lista todos los `inputs[]` y la unión de fingerprints. Si al correr `--baseline` el set de paths input difiere → warning (`baseline inputs differ`) + sigue (hash check por input path matching: comparar solo inputs cuyo path label coincide).

### Semántica de filtrado

```
evaluate → findings (sort estable)
→ filter: baseline on ∧ fingerprint ∈ set → drop (o marcar suppressed)
→ apply failOn on REMAINING findings
→ summary.suppressed = dropped count
→ reportHash: ¿incluye filtrados?
```

**Decisión reportHash:** canónico de f1 usa `summary` + `findings` visibles. Campo `suppressed` entra en summary ⇒ **sí** cambia reportHash cuando cambia suppressed (correcto: run con baseline ≠ run sin baseline). Findings filtrados **no** aparecen en `findings[]` (limpio para CI annotations). Opcional futuro: `meta.baseline = { path, version }` — fuera de meta hasheada; **f2 no agrega meta.baseline al hash**.

### Compatibilidad inputHash

- Por cada `inputs[i]` del baseline: si hay input actual con mismo `path` label y `sha256` distinto → `warning: baseline inputHash mismatch for <path> (spec changed)` (default) o exit 2 con `--strict-hash`.
- Fingerprint de findings viejos simplemente no matchean tras cambios grandes — correcto.
- Input actual sin entrada en baseline → ok (spec creció).
- Baseline con inputs que ya no existen → warning `baseline entry unused: <path>`.

### Config (ver f2-config)

```yaml
baseline:
  enabled: true
  path: .apigovscan/baseline.json
  strictHash: false
```

Flags > config.

### Escritura / INV-7

- Default path `.apigovscan/baseline.json` — **permitido** por INV-7 (`.apigovscan/`).
- `--baseline-path` explicit = output explícito (mismo trat que `--output`).
- Si existe y sin `--force`: exit 2  
  `baseline already exists: <path> (pass --force to overwrite)`.  
  **Backup:** con `--force`, copia a `<path>.bak` una sola vez (overwite bak también con force) — doc 03; implementar simple `copyFile`.
- Directorio `.apigovscan/` se `mkdir -r` al escribir.
- **No** escribe nada si `--baseline` (solo lectura).

### Exit codes (aditivo a f1)

| Código | Condición nueva                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------- |
| 2      | baseline missing con enabled, version desconocida, force needed, strict-hash mismatch, parse invalid JSON |

`failOn` se evalúa **solo sobre findings no filtrados** (FR-22).

## 4. Criterios de aceptación

- [x] **AC-B.1** `analyze --write-baseline` sobre fixture ⇒ crea `baseline.json` con `version:1`, `fingerprints` sort unique, `inputs[].sha256` correctos; exit según findings completos.
- [x] **AC-B.2** Segundo `--write-baseline` sin `--force` ⇒ exit 2; con `--force` ⇒ exit 0 y `.bak` creado si había archivo previo.
- [x] **AC-B.3** `analyze --baseline` tras write ⇒ `summary.suppressed ≥ 1`, `findings` sin los filtrados, exit 0 si los restantes < failOn.
- [x] **AC-B.4** Spec modificado (nuevo finding) + `--baseline` ⇒ solo el nuevo (o los no-listados) en findings; exit 1 si ≥ failOn.
- [x] **AC-B.5** `inputHash` mismatch default ⇒ warning en stderr; corrida sigue; `--strict-hash` ⇒ exit 2; `--baseline-ignore-hash` ⇒ sin warning.
- [x] **AC-B.6** `--baseline` con archivo inexistente ⇒ exit 2 `baseline not found` (mensaje sugiere `--write-baseline`).
- [x] **AC-B.7** JSON `baseline.json` con `version: 99` ⇒ exit 2 mensaje de versión.
- [x] **AC-B.8** Console output incluye `(baseline: N suppressed)` cuando N>0.
- [x] **AC-B.9** Determinismo: dos `--write-baseline` back-to-back (con force) ⇒ mismos fingerprints y mismos `inputs[].sha256` (salvo `createdAt`).
- [x] **AC-B.10** `--baseline` no escribe ningún archivo (INV-7: spy/mtimes).
- [x] **AC-B.11** Config `baseline.enabled: true` equivale a flag (e2e).
- [x] **AC-B.12** e2e criterio de salida fase 2: con baseline en fixture sucia, introduce error nuevo → exit 1 solo por nuevo; sin baseline, mismos findings viejos no bloquearían distinto (snapshot counts).

## 5. Test plan

| Caso                            | Tipo                 |
| ------------------------------- | -------------------- |
| write → read filter roundtrip   | e2e                  |
| force / bak / missing           | e2e                  |
| strict-hash / ignore-hash       | e2e + unit           |
| suppressed en summary + console | unit reporters + e2e |
| determinism fingerprints sort   | unit                 |
| multi-input directory           | e2e                  |
| INV-7 no extra writes           | invariants o unit fs |

## 6. Dependencias

- `f1-engine` (fingerprint ya estable)
- `f1-reporters` (`summary.suppressed` opcional — habilitar)
- `f2-config` (bloque baseline en config) — paraleizable
- **No** depende de f3 skills

## 7. Riesgos y decisiones abiertas

| Tema                                     | Decisión                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| reportHash incluye suppressed            | Sí (va en summary canónica)                                                                                         |
| write emite reporte también              | Sí                                                                                                                  |
| multi-spec                               | Un baseline multi-input; warnings por drift de path set                                                             |
| backup behavior                          | `.bak` con `--force` si existía                                                                                     |
| fingerprint after message change en pack | Igual que learn: fingerprint no incluye severity ni pack version (f1); messages mayores = breaking pack documentado |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 2 + FR-20…22 + doc 03 §10.
- 2026-09-24 · M2.3 implementado: baseline.ts build/load/filter + flags + summary.suppressed + console note + tests AC-B.*; estado → `implementada`.
