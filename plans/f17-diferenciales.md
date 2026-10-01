# Plan f17 · Diferenciales competitivos (backlog T1–T3)

| Campo     | Valor                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| Estado    | backlog (todas las specs referenciadas en `draft`)                                 |
| Fase      | 17                                                                                 |
| Fecha     | 2026-09-30                                                                         |
| Deriva de | Análisis competitivo vs Spectral / vacuum / Redocly CLI / oasdiff (2026-09-30)     |

Backlog priorizado de diferenciales tangibles contra herramientas equivalentes.
Cada item referencia su spec; nada pasa a `ready` ni a código sin resolver las
decisiones del dueño (§5). Regla de oro de [specs](../specs/README.md) intacta.

## 1. Contexto competitivo (resumen)

| Competidor   | Dolor no curado (evidencia Sep 2026)                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Spectral     | Telemetría en la imagen Docker (documentada en su README); lento en specs grandes; suppressions inline que contaminan el spec; custom functions JS arbitrarias |
| vacuum       | Update-check con red en cada corrida (opt-out por flag); ignore-file por JSONPath que se rompe al refactorizar; reglas JS con `fetch` |
| Redocly CLI  | Empuje permanente a plataforma cloud (`login`/`push`/Reef); ignore-file por pointer estático; portfolio solo en producto pago |
| oasdiff      | Solo breaking changes; MCP server hosted en `api.oasdiff.com/mcp` (nube)                                   |

Posición: governance **local, determinista, sin telemetría, con loop de
aprendizaje**. No competir en velocidad cruda (vacuum) ni en profundidad de
diff (oasdiff) ni en generación de docs (anti-alcance SDD §4).

## 2. Backlog

### Tier 1 — diferenciales de posicionamiento (primero)

| #  | Item                                                | Spec                                                                                     | Dolor que cura                                                             | Por qué no lo copian rápido                                                     |
| -- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1  | Attestations firmadas (`certify`/`verify`)          | [f8-certify](../specs/f8-certify.md) (draft)                                             | "¿quién aprobó este cambio y contra qué pack?" con agentes de código en masa | Requiere determinismo (INV-2) + cero red (INV-1): los competidores telean       |
| 2  | Migration kit: reglas + excepciones → skills        | [f17-migration-kit](../specs/f17-migration-kit.md) + [f8-spectral-import](../specs/f8-spectral-import.md) | Costo de switching desde Spectral/Redocly/vacuum                           | Suppressions por fingerprint que sobreviven refactors; los ignore-files ajenos no |
| 3  | FP budget: ruido medido por regla, sin telemetría   | [f8-fp-budget](../specs/f8-fp-budget.md) (draft)                                         | "Los linters gritan demasiado" — objeción #1 de adopción                   | Requiere loop learn (INV-5) ya construido; nadie tiene feedback loop            |

### Tier 2 — valor alto, esfuerzo mayor

| #  | Item                                                | Spec                                                          | Dolor que cura                                          | Nota                                        |
| -- | --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| 4  | Compliance pack + mapeo finding→control             | [f17-compliance-pack](../specs/f17-compliance-pack.md)        | Evidencia para audits (OWASP API, GDPR) sin nube        | Se potencia con #1 (firma) y #3 (FP medido) |
| 5  | Ratchet + burn-down                                 | [f17-ratchet](../specs/f17-ratchet.md)                        | Deuda congelada que nunca baja; ignore-files que crecen  | Sobre fingerprints + historial ya existentes |
| 6  | Mini-validator de ejemplos contra schemas           | [f13-mini-validator](../specs/f13-mini-validator.md)          | Ejemplos/docs que mienten respecto del schema           | Determinista y offline                      |

### Tier 3 — paridad (no diferencial, pero necesaria)

| #  | Item                                                | Spec                                                      | Dolor que cura                       | Nota                        |
| -- | --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ | --------------------------- |
| 7  | Reporters junit/checkstyle/codequality + recetas CI | [f17-ci-reporters](../specs/f17-ci-reporters.md)          | Jenkins/GitLab/Azure (no GitHub)     | Paridad con Redocly         |
| 8  | LSP para feedback en editor                         | [f17-lsp](../specs/f17-lsp.md)                            | Feedback en write-time, no en CI     | Paridad con vacuum/Spectral |

## 3. Orden sugerido y dependencias

```
#3 fp-budget ──────────┐ (arranca ya: 100% local, desbloquea calidad medible)
#1 certify ────────────┤ (bloqueado por decisión de firma §5; decidir en paralelo)
#2 migration-kit ──────┤ (excepciones: independiente; reglas: requiere f8-spectral-import ready)
#5 ratchet → #4 compliance → #6 mini-validator
#7 ci-reporters → #8 lsp   (paridad, van último)
```

- #4 se beneficia de #1 y #3 pero no los bloquea.
- #8 es el de mayor esfuerzo y el único puramente de paridad grande: no debería
  ganarle a nada de T1/T2.

## 4. Anti-alcance (recordatorio)

- No competir en velocidad cruda ni generar docs (SDD §4).
- No portal/catalog, no telemetría, no auto-mutación de packs (INV-1/INV-7).
- Todo lo de este plan corre offline salvo pasos explícitos ya existentes.

## 5. Decisiones del dueño (2026-09-30)

1. `f8-certify`: **resuelta e implementada** (M17.2) — ed25519 detached sobre
   bytes crudos, `ankaa certify` (gated) + `ankaa verify` (ungated),
   atestaciones deterministas.
2. `f8-fp-budget`: **resuelta e implementada** (M17.1) — feedback de learn +
   tracking dashboard; n>=10; >30% = noisy; `ankaa skills stats`.
3. `f8-spectral-import`: **resuelta e implementada (2026-10-01, M17.9)** —
   vendor pineado 1.23.0 (módulo TS bundleado, cero IO) + shapes genéricos
   S1..S7 + `SPEC-NNN` + envelope `rules import` + límites reusados;
   `ankaa migrate --spectral-rules`. Port curado (bucket C del inventario)
   queda como épica aparte per ADR-14; `--spectral-disables` follow-up.
   Inventario y detalle en [spec §3b/§3c/§4](../specs/f8-spectral-import.md).
4. `f17-migration-kit`: **resuelta e implementada** (M17.3, excepciones
   redocly+vacuum) — `ankaa migrate` escribe `skills/migrated/<origin>.yaml`
   idempotente; piezas Spectral son follow-up documentado en el spec (reglas:
   gated a `f8-spectral-import`; disables: requieren mapper de líneas).
5. `f17-compliance-pack`: **resuelta e implementada** (M17.5) — frameworks v0
   OWASP API 2023 + GDPR; `PRIV-001` en elite (96 reglas) con átomo
   `examplePii` (spec `f1-engine` primero); `PRIV-002` configurable queda
   follow-up documentado en el spec.
6. `f17-ratchet`: **resuelta e implementada** (M17.4) — gate default
   `error`, severidad única, skills cuentan como resueltos; trends de
   scan-org/dashboard quedaron como follow-up (sin milestone asignado)
   documentado en el spec.
7. `f17-ci-reporters`: **resuelta (2026-10-01)** — dueño elige **A→B
   escalonado**: M17.7a junit + codequality + checkstyle con fallback
   `line="1"` + pointer en message; M17.7b mapper YAML (`parseDocument`,
   misma dep) a demanda de checkstyle. JSON siempre fallback. Detalle en
   [spec §8](../specs/f17-ci-reporters.md). Pendiente menor: pinnear schemas
   JUnit/Checkstyle antes de implementar.
8. `f17-lsp`: **resuelta (2026-10-01)** — dueño decide: solo binario + docs
   por editor (marketplace postergado), protocolo hand-rolled cero deps,
   **M17.7b activado** en el slice (squiggles reales en YAML), cache por
   hash de contenido. Detalle en [spec §7](../specs/f17-lsp.md).

## 6. Definition of done (por item)

- Spec en `ready` con decisiones de §5 resueltas + plan/tasks propios.
- `pnpm check` verde; invariantes INV-1…INV-7 intactas.
- README/docs actualizados si cambia contrato público; changelog del spec.

## Changelog

- 2026-09-30: backlog inicial T1–T3 con specs `f17-*` creadas y referencias a
  drafts existentes (`f8-certify`, `f8-fp-budget`, `f8-spectral-import`,
  `f13-mini-validator`).
- 2026-09-30: dueño resuelve decisiones 1, 2 y 4 (§5). Arranca T1 por
  `f8-fp-budget` (M17.1): `ankaa skills stats` implementado, spec →
  `implementada`, `pnpm check` verde. Siguiente: `f8-certify` (ACs) o
  `f17-migration-kit` excepciones.
- 2026-09-30: `f8-certify` (M17.2) implementado: `ankaa certify`/`verify`
  (ed25519 detached, `node:crypto`, cero deps) + 11 tests · spec →
  `implementada` · `pnpm check` verde. T1 restante: `f17-migration-kit`.
- 2026-09-30: `f17-migration-kit` (M17.3) implementado: `ankaa migrate`
  (excepciones redocly/vacuum → `skills/migrated/`, matching por location,
  idempotente) + loader de skills extendido + 13 tests · spec →
  `implementada`. **Tier 1 completo** (fp-budget, certify, migration-kit).
  Siguiente: T2 (`f17-ratchet` propuesto primero por tamaño/valor).
- 2026-09-30: `f17-ratchet` (M17.4) implementado: `--ratchet` /
  `--ratchet-severity` + `summary.ratchet` + 8 tests · spec → `implementada`.
  T2 restante: `f17-compliance-pack` y `f13-mini-validator`.
- 2026-09-30: `f17-compliance-pack` (M17.5) implementado: átomo `examplePii`
  + `PRIV-001` (elite 96) + `compliance-mappings.yaml` + `export --controls`
  + 9 tests · spec → `implementada`. T2 restante: `f13-mini-validator`
  (draft).
- 2026-10-01: `f13-mini-validator` (M17.6) implementado: `ankaa
  validate-examples` (subset §2, `$ref` locales, budgets depth/size) +
  `EXVAL-001/002` + 16 tests · spec → `implementada`. **Tier 2 completo**
  (ratchet, compliance-pack, mini-validator). Restan T3 (`f17-ci-reporters`,
  `f17-lsp`).
- 2026-10-01: análisis de viabilidad mapper pointer→line/col agregado a la
  spec `f17-ci-reporters` (§8, spike sobre `yaml` 2.9.1): recomendación A→B
  escalonado. Decisión §5.7 del dueño sigue pendiente.
- 2026-10-01: dueño cierra §5.7 (**A→B escalonado**) y pinnear schemas (junit
  4-style, checkstyle 8.x, codequality CodeClimate). `f17-ci-reporters`
  (M17.7a) implementado: `--format junit|checkstyle|codequality` +
  recetas `examples/ci/` + 15 tests · spec → `implementada`. T3 restante:
  `f17-lsp` (decisiones de alcance pendientes). M17.7b (mapper YAML) a
  demanda.
- 2026-10-01: dueño cierra §5.8 (binario+docs, hand-rolled, M17.7b activado,
  cache). `f17-lsp` (M17.8a+b) implementado: `Spec.positions` (f1-openapi
  regla 5b) + checkstyle/sarif/codequality con líneas reales +
  `packages/lsp` (LSP 3.17 stdio hand-rolled, cero deps) + `ankaa lsp` con
  paridad CLI + 21 tests · specs → `implementada`. **Backlog T1+T2+T3
  completo** (8/8).
- 2026-10-01: `f8-spectral-import` (M17.9) implementado: spike de
  inventario verificable (57 reglas @1.23.0: 14 cubiertas / 4 netas / 15
  port curado / 24 skip) + vendor pineado bundleado + transpiler shapes
  S1..S7 + `ankaa migrate --spectral-rules` + 18 tests · spec →
  `implementada`. Con esto el migration-kit cubre excepciones **y reglas**
  (la pieza `spectral` de §5.3 cierra).
