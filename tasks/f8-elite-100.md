# Tasks · f8-elite-100

Plan: [plans/f8-elite-100.md](../plans/f8-elite-100.md) · Spec: [specs/f8-elite-100.md](../specs/f8-elite-100.md)

## M8.5 — pack 88 (cierre 2026-09-27)

- [x] Curar reglas RESP-006…016 en `responses.yaml`
- [x] Curar reglas ERR-007…009, AUTH-006, NAMING-011, PARAM-008/009, DOCS-007/008, SCHEMA-006, STRUCT-007, DEPR-003
- [x] `sources.yaml` + OWASP; doc 04 fila si aplica
- [x] `elite-100.test.ts` true+false por regla + conteo
- [x] Medir ruido ×4 fixtures; tunear hasta verde
- [x] CHANGELOG pack + README/docs + índices
- [x] `pnpm check` verde
- [x] Spec `f8-elite-100` → `cerrada` + índices

## M8.6 — backlog de curaduría priorizado (2026-09-30, investigación web)

Fuente: comparativa Spectral/Vacuum/Redocly/Zally/oasdiff + serie 2026 de API Evangelist. Estado real: elite 88 reglas (flacos: performance 1; consistency/deprecation/pagination/security/versioning 3 c/u). Marca [AHORA] = próximos 4; el resto es backlog con criterio de entrada.

### Golpes rápidos (días/semanas, casi puro YAML)

- [x] [AHORA] Ejemplos bueno/malo por regla (`examples: {bad, good}` en el schema): alimenta docs, prompts LLM y fixtures de un tiro — hecho 2026-09-30: AC-E.13 en `f1-engine` (schema + Finding + explain), prompt `fix`/MCP, "Copy prompt" del dashboard, redacción en reportes, 8 reglas elite sembradas (pack 2026.09.3 unreleased)
- [x] Higiene de contrato: componentes sin usar, paths ambiguos/duplicados, trailing slash, ejemplos vs schema, enums duplicados, scopes OAuth indefinidos, URLs example.com olvidadas — hecho 2026-09-30: 3 átomos nuevos (AC-E.15) + STRUCT-008/SEC-004/NAMING-012/DOCS-009 (94 reglas, ruido cero); trailing-slash/duplicados ya cubiertos (NAMING-002/003, PARAM-006); ejemplos-vs-schema y enums-dup fuera de v1 (ver CHANGELOG 2026.09.5)
- [x] Niveles de estabilidad (`x-stability-level: draft/beta/stable`): las estrictas no muerden endpoints en draft (ideal antes de sumar reglas estrictas nuevas) — hecho 2026-09-30: AC-O.15/AC-E.14 (mecanismo en parser+engine, cero cambios al pack)
- [x] Engordar dominios flacos (PERF/CONS/DEPR/PAG/SEC/VER) con joyas baratas de los catálogos rivales, con medición de ruido por fixture (playbook f8-elite-100) — hecho 2026-09-30: PAG-004 + PERF-002 (90 reglas, ruido cero); SEC/CONS/DEPR/VER sin cambios deliberados (ver CHANGELOG 2026.09.4)

### Estructurales (un mes+ c/u; spec primero por AGENTS.md)

- [x] [AHORA] Breaking-change spec-vs-spec (`diff base..head`: paths/ops eliminadas, required agregados, narrowing, sunsets): requiere átomos cross-document en el engine; es el feature enterprise más vendible (hueco dejado por Optic) — hecho 2026-09-30: spec `f12-breaking` (AC-BK.1…7) + `diffSpecs` standalone en core (decisión: no átomos cross-doc, findings estándar) + CLI `diff` con gate/skills/sinks
- [x] [AHORA] Waivers con expiración (`expires` + `owner` en suppressions + aviso de waiver huérfano) — hecho 2026-09-30: AC-S.11…14 en `f3-skills` (schema + vencido⇒ignorado+warning + huérfano⇒warning + `suppress --expires/--owner` + feedback `learn`)
- [x] [AHORA] Métrica de cobertura de gobernanza (% de la spec que mira alguna regla) en dashboard/scan-org — hecho 2026-09-30: spec `f11-coverage` (AC-CV.1…7) + `computeCoverage`/`mergeCoverages` en core + `Report.coverage` + console + badge dashboard + `avgCoverage` scan-org
- [x] Agent Rule Export: pack → bloque AGENTS.md (error=MUST, warning=SHOULD, info=MAY) + pack de prompts de remediación (casi un reporter nuevo; reusa `explain` + `buildFixMessages`) — hecho 2026-09-30: `rules export [--as agents-md|prompts-json]` (AC-R2.11…14 en `f2-custom-rules`), render puro sin LLM, customs vía `--rules`

### Estratégicas (apuestas; spike o historia de consumidor antes de codear)

- [x] Auditoría OWASP API Top 10 2023 regla por regla, publicada como tabla (artefacto de confianza enterprise, no código) — hecho 2026-09-30: tabla en `packs/elite/README.md` (full: API2/API8; partial ×6; none: API7/API10, con rationale honesto)
- [ ] Import de rulesets Spectral (heredar miles de reglas; caro: segundo DSL, choca con whitelist — spike de diseño primero)
- [ ] Certificación tamper-evident (`certify` sobre reportHash+score+pack; falta historia de quién verifica del lado consumidor)
- [ ] Presupuesto de falsos positivos por regla (auto-flag si se suprime >X%; requiere datos de uso primero)
