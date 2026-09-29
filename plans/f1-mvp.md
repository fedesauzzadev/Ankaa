# Plan · f1-mvp · `analyze` end-to-end

| Campo             | Valor                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| Specs             | f1-openapi, f1-engine, f1-elite-pack, f1-analyze, f1-reporters, f1-invariants |
| Esfuerzo estimado | 1–2 semanas (1 dev full-time equivalente)                                     |
| Dependencias      | f0 cerrado                                                                    |
| Milestones        | M1.1–M1.5                                                                     |

## Estrategia

**Vertical slice temprana:** llegar a un `analyze` jugoso con 5–10 reglas lo antes posible; después escalar el pack y hardening. Evitar: 3 semanas de openapi puro sin CLI visible.

```
M1.1 parse+Spec          ─┐
M1.2 engine mínimo       ─┼→ M1.4 analyze e2e + reporters
M1.3 pack skeleton (10)  ─┘
M1.5 pack ≥50 + invariants full + polish → cierre fase
```

## M1.1 — OpenAPI → Spec

**Alcance:** spec `f1-openapi` completo de contratos y AC-O.1…14.

Pasos:

1. Spike de lib YAML con límites (1–2 h): probar alias bomb + depth.
2. Implementar `parseSpec` + errors tipados.
3. Normalizador: operations, merge params, sort, jsonPointer, inputHash.
4. `$ref` local sandbox + remote forbidden + cycles.
5. Fixtures de ataque + petstore + tests AC-O.

**DoD:** todos AC-O verdes; package `openapi` con API exportada.

**Riesgo:** swagger-parser vs own — resuelto: paquete `yaml` v2 (sin swagger-parser). Ver tasks/f1-mvp.md M1.1.

## M1.2 — Engine + DSL mínimo

**Alcance:** spec `f1-engine`.

Pasos:

1. Tipos Rule/Finding/Matcher + zod strict.
2. `validateRule` + issues.
3. Átomos del sprint 1 (los que necesita el pack skeleton): path/plural/method/responses/description/operationId/security/params required.
4. `evaluate` + sort + fingerprint.
5. Overrides/disabled.

**DoD:** AC-E.1…11 (excepto performance final).

**Orden con M1.1:** puede correr en paralelo si los tipos `Spec` ya están congelados en M1.1 día 2 (congelar interface Spec temprano = contrato).

## M1.3 — Pack elite skeleton (10–15 reglas)

**Alcance:** parte de `f1-elite-pack` + `pack.yaml`/`sources.yaml`.

Pasos:

1. Estructura de directorios + loader de pack (objeto → Rule[]).
2. Primeras reglas de alto valor: STRUCT-001..003, NAMING-001/003/009, DOCS-001/004, RESP-001, ERR-001, PARAM-001/002, AUTH-003, SEC-002.
3. Gap analysis de átomos faltantes → PRs al engine.
4. validate CI del pack (count parcial).

**DoD:** pack carga en tests; ~10+ reglas con source.

## M1.4 — Analyze e2e + reporters

**Alcance:** `f1-analyze` + `f1-reporters`.

Pasos:

1. `analyzeUseCase` + puertos.
2. Adapters: SpecLoader FS, PackRepository embebido, ReportSink stdout/file.
3. CLI argv (commander/cac o hand-rolled mínimo — preferir hand-rolled o lib chiquita).
4. Config `apigovscan.yaml` subconjunto.
5. `formatConsole` + `formatJson` + reportHash + redacción.
6. Exit codes + discovery de directorio + stdin.
7. Tests e2e con execa/spawn.

**DoD:** AC-A.* y AC-R.* verdes; demo local: `node cli analyze fixture`.

**Gate:** INV-1 (no red) y INV-2 (double hash) **deben** pasar desde este milestone.

## M1.5 — Pack ≥50 + invariants + cierre

**Alcance:** resto de `f1-elite-pack` + `f1-invariants` + polish.

Pasos:

1. Completar inventario (tabla del spec); átomos faltantes al engine.
2. Calibración de ruido en fixtures públicos committeados; snapshots de conteo.
3. Suite `test:invariants` completa (INV-1..7 mínimos).
4. CHANGELOG pack `2026.09.1` con impacto.
5. README de usuario: quickstart `npx` (aunque aún no publicado: instructions con `pnpm dlx` / bin local).
6. Performance check NFR-02 (spec ≤ 1 MB < 2 s) — medir y anotar en CHANGELOG/PR.

**DoD:** todos AC de specs f1 verificados; criterio de salida de Fase 1 del SDD §7 cumplido.

## Orden de merge recomendado (PRs)

1. `feat/openapi-parser` (M1.1)
2. `feat/rules-engine` (M1.2)
3. `feat/elite-pack-skeleton` (M1.3)
4. `feat/analyze-cli` (M1.4) — primer e2e
5. `feat/elite-pack-full` + `feat/invariants` (M1.5, puede partirse en 2 PRs)

## Riesgos del plan

| Riesgo                          | Impacto             | Mitigación                                                              |
| ------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| Pack ≥50 reglas de baja calidad | Ruido, desconfianza | Threshold fixtures; mejor 50 buenas que 80 malas; inventor comprometido |
| Átomos engine quedan cortos     | Pack no cierra      | Gap analysis en M1.3, no al final                                       |
| YAML parser inseguro/lento      | INV-1/NFR-2         | Spike M1.1 day 1                                                        |
| CLI argv creep                  | Demora              | Solo flags de spec f1-analyze; nada de baseline/learn                   |
| Multi-OS path bugs              | CI rojo             | Normalizar paths; matrix desde f0                                       |

## Definition of Done (fase 1 completa)

- [x] Specs `f1-*` todos en estado `implementada` (cerrada formal al cerrar fase)
- [x] `pnpm check` verde matriz OS
- [x] Criterio salida SDD Fase 1: MVP analiza fixture con pack elite ≥50, reporte determinista, INV-1..3 verificadas
- [x] README quickstart real
- [x] Tag `v0.1.0-mvp` (release local; npm publish no realizado — opcional)

## Changelog del plan

- 2026-09-23 · Plan inicial desde specs f1.
