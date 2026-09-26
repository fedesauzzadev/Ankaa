# Plan · f8-elite-100 · Pack elite 100+ (M8.5)

| Campo | Valor |
|---|---|
| Specs | f8-elite-100 |
| Dependencias | f1-elite-pack cerrado (contrato, allowlist aditiva) |

## M8.5 — Curación + tests + medición

1. Curar ~23 reglas nuevas en archivos por categoría (solo átomos existentes; severidades warning/info; fuentes citadas con URL válida).
2. `elite-100.test.ts`: true+false por regla con specs inline + conteo ≥ 100.
3. Añadir `owasp-api-security` a `sources.yaml`; fila OWASP en doc 04 §2 si se usa.
4. Medir ruido en los 4 fixtures; tunear (achicar o dropear) hasta thresholds verdes.
5. CHANGELOG del pack (inventario + impacto), README/docs con conteo nuevo, índices.
6. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-E100.1–6 verdes; INV-2 verde; cero cambios a tests congelados salvo los propios del milestone.

## Changelog del plan

- 2026-09-26 · Plan inicial (handoff).
