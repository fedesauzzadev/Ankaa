# f8-elite-100 · Pack elite 65 → 88 reglas curadas (solo átomos existentes)

| Campo     | Valor                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                 |
| Fecha     | 2026-09-26                                                                                              |
| Fase      | 8 (M8.5 del umbrella `f8-oss-differentials`)                                                            |
| Deriva de | `f8-oss-differentials` M8.5; `f1-elite-pack` (contrato de cobertura, taxonomía, curación); doc 04 §§2–4 |

## 1. Objetivo

Llevar el pack `elite` de 65 a **88 reglas activas** (cierre honesto del objetivo 100+: techo de átomos sin engine nuevo, ver §7) con curación real (fuentes citadas, severidad calibrada según doc 04 §3), **sin cambiar el engine** (solo átomos del whitelist existente) y **sin romper** tests congelados ni thresholds de ruido.

## 2. Alcance

### In

- ~23 reglas nuevas en archivos existentes por categoría (`responses`, `errors`, `auth`, `naming`, `parameters`, `docs`, `schemas`, `structure`, `deprecation`), numeración continua por prefijo.
- Severidades solo `warning`/`info` (cero findings nuevos de severidad `error` en fixtures: protege exit codes).
- Restricción dura: **cero findings nuevos en `petstore-mini.{yaml,json}`** (score congelado `{74, C}` en `analyze.e2e`), techos de ruido intactos (≤60 mini, ≤80 públicas).
- Nueva fuente `owasp-api-security` en `sources.yaml` (solo usada donde aplica de verdad).
- Test `elite-100.test.ts`: por cada regla nueva, spec inline donde **matchea + una donde no** (AGENTS.md §7), usando `evaluate()` con el pack real cargado.
- CHANGELOG del pack con inventario nuevo e impacto medido por fixture; README/docs con conteo actualizado.

### Out

- Cambios al engine/DSL (si un átomo falta, es otro milestone con spec de `f1-engine` primero — AGENTS.md §6).
- Reglas `error` nuevas que disparen en fixtures (rompen exit codes congelados).
- Relleno por conteo: cada regla debe tener fuente genuina y caso de uso real.
- Cambiar thresholds de ruido salvo justificación medida en CHANGELOG.

## 3. Contrato

- Formato YAML idéntico al existente (`id`, `category`, `severity`, `message`, `fix`, `source{title,url,section?}`, `when`).
- `source.url` válida (`strictSource`), ids únicos `PREFIX-NNN` continuando cada serie, mensajes EN sin placeholders de locale (AC-P.10).
- `validateRule` pasa para todas (AC-P.4 existente lo cubre).

## 4. Criterios de aceptación

- [ ] **AC-E100.1** `active.length >= 100` (`enabledByDefault !== false`, mismo predicado que AC-P.1).
- [ ] **AC-E100.2** AC-P.1…P.10 existentes siguen verdes sin tocar thresholds ni fixtures.
- [ ] **AC-E100.3** Cada regla nueva tiene test true+false con specs inline (`elite-100.test.ts`).
- [ ] **AC-E100.4** `petstore-mini.yaml` sigue en score `{74, C}` exacto y exit 0 en los tests que lo exigen.
- [ ] **AC-E100.5** CHANGELOG del pack documenta inventario nuevo + impacto por severidad medido.
- [ ] **AC-E100.6** Severidades calibradas según doc 04 §3 (nada nuevo en `error` que dispare en fixtures).

## 5. Test plan

- `packages/cli/test/elite-100.test.ts`: por-regla true+false + conteo ≥ 100.
- Suites existentes como red de regresión (ruido, exit codes, hashes, paridad MCP).
- Medición de ruido por fixture antes/después (tabla en CHANGELOG).

## 6. Dependencias

- `f1-elite-pack` (contrato, taxonomía, allowlist — aditiva, sin cambios).
- Curación humana (este milestone es curación, no código de motor).

## 7. Riesgos y decisiones abiertas

| Tema                                      | Decisión v1                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Techo de reglas honestas sin engine nuevo | ~85-90; si el conteo final queda ahí, se sinceran umbrella y titulares en vez de rellenar (f1 spec: calidad sobre conteo). |
| Reglas que nunca disparan en fixtures     | Aceptadas si son guidance real con fuente (se testean inline); no se inventa guidance débil para sumar.                    |
| Thresholds                                | No se tocan salvo medición justificada en CHANGELOG.                                                                       |

## Changelog

- 2026-09-26 · Spec creado en `ready` (quinto milestone ejecutable de f8; handoff vía AGENTS.md + este spec).
- 2026-09-27 · Cerrada en **88 reglas** (23 nuevas: 21 warning + 2 info). Desvíos sincerados: DOCS-ejemplos (`exampleRequired`) descartado — rompía el threshold de fixtures públicas (81 > 80); DOCS-007 reescrito a TODO/FIXME-markers (ruido 0). Ruido final: mini 14 (0/6/8, score {74,C} intacto), públicas 74 (18/38/18). `elite-100.test.ts` 25 tests + `pnpm check` verde. El "100+" queda como aspiración con engine nuevo, no como deuda.
