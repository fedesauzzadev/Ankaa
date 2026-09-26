# f6-score · Governance score (0-100 + grade)

| Campo | Valor |
|---|---|
| Estado | ready |
| Fecha | 2026-09-26 |
| Fase | 6 |
| Deriva de | SDD §7 (re-priorización de producto 2026-09-26), FR-45; docs/01 §6.5; specs `f1-reporters`, `f5-reporters` |

## 1. Objetivo / user story

Como API owner quiero un **score único y reproducible** (0-100 + grade A–F) que resuma el estado de governance de una spec o set de specs, para trackear mejora en el tiempo y comunicar estado a no-técnicos.

**Re-priorización de producto (2026-09-26):** el destino es una org que **instala** el producto (privado). El score es la métrica #1 para dashboards/tendencia dentro del cliente; el registry Cloudflare del SDD pasa a fase posterior.

## 2. Alcance

### In

- `Report.score: { value: 0..100; grade: "A"|"B"|"C"|"D"|"F" }` — campo **requerido**, calculado en `buildReport`.
- Fórmula determinista sobre `summary` **post skills/baseline** (lo que el gate ve):
  `penalty = 8*error + 3*warning + 1*info` · `value = max(0, 100 - penalty)`.
- Grades: `≥90 A · ≥75 B · ≥60 C · ≥40 D · <40 F`.
- Console footer: `· score 74 (C)`.
- Markdown: fila `| Score | 74/100 (C) |`.
- SARIF: `runs[0].properties["apigovscan/score" | "apigovscan/grade"]`.
- MCP `analyze_spec`: payload incluye `score`.
- `score` entra al `reportHash` (INV-2: determinista).

### Out

- Normalización por tamaño (ops/schemas) — v1 documentada en §7.
- Tendencia/histórico de score (fase de dashboard/posterior).
- Pesos configurables — v1 fijos (cambiarlos = cambio de contrato + spec).
- Score en `annotations` (solo líneas de finding).

## 3. Contrato

```ts
// packages/reporters/src/build.ts
export interface ReportScore {
  value: number; // 0..100
  grade: "A" | "B" | "C" | "D" | "F";
}
export interface Report {
  // ...
  summary: ReportSummary;
  score: ReportScore; // nuevo campo requerido
  findings: Finding[];
  reportHash: string;
}
```

- `buildReport` computa score desde `summary`; `computeReportHash` lo incluye.
- Console (footer): `! 0 errors · 6 warnings · 8 infos · score 74 (C) · reportHash 1a2b3c4d`.
- Markdown (tabla resumen): `| Score | **74/100 (C)** |` (después de Findings).
- SARIF: `runs[0].properties = { "apigovscan/score": 74, "apigovscan/grade": "C" }`.
- MCP `analyze_spec` payload: `score: { value, grade }`.

## 4. Criterios de aceptación

- [ ] **AC-S.1** `buildReport` con 0 findings ⇒ `score = { value: 100, grade: "A" }`.
- [ ] **AC-S.2** Fórmula exacta: `8E+3W+1I` de penalty, floor 0; `petstore-mini` (0E/6W/8I) ⇒ score 74 (C).
- [ ] **AC-S.3** Grades en los cortes 90/75/60/40 (tests de borde).
- [ ] **AC-S.4** `formatConsole` incluye `score 74 (C)` en el footer (con y sin color).
- [ ] **AC-S.5** `formatMarkdown` incluye fila `| Score |`.
- [ ] **AC-S.6** SARIF `runs[0].properties` con `apigovscan/score` y `apigovscan/grade`.
- [ ] **AC-S.7** MCP `analyze_spec` devuelve `score` igual al JSON del CLI (paridad).
- [ ] **AC-S.8** INV-2: score derivado de `summary`; mismo input ⇒ mismo score y `reportHash` estable entre runs.

## 5. Test plan

- Unit `packages/reporters/test/score.test.ts`: fórmula, bordes de grade, cap 0, hash incluye score.
- Unit formats: console/markdown/sarif muestran score.
- E2E `packages/cli/test/analyze.e2e.test.ts`: `--format json` incluye score; `markdown` muestra fila.
- E2E MCP `packages/cli/test/mcp.e2e.test.ts`: paridad de `score` (extiende AC-T.10).

## 6. Dependencias

- `f1-reporters` (contrato `Report` — changelog allí por el campo nuevo).
- `f5-reporters` (markdown/sarif tocan la misma superficie).

## 7. Riesgos y decisiones abiertas

| Tema | Decisión v1 |
|---|---|
| Sin normalización por tamaño | Aceptado: specs grandes puntúan peor; documentar; revisar en v2 con densidad por op. |
| Score dentro de reportHash | Sí: cualquier cambio de findings/score invalida el hash (auditable). |
| Pesos 8/3/1 | Fijos v1; sencillos de explicar (`error ≈ 3 warnings`). |
| Score histórico | Fuera de v1 — requiere persistencia (dashboard/posterior). |

## Changelog

- 2026-09-26 · Spec creado (re-priorización producto privado; estado `ready`).
