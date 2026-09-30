# f17-compliance-pack · Evidencia de compliance offline (PII + mapeo a controles)

| Campo     | Valor                                                    |
| --------- | -------------------------------------------------------- |
| Estado    | implementada                                                     |
| Fase      | 17                                                       |
| Fecha     | 2026-09-30                                               |
| Deriva de | SDD §8 (privacidad); `f6-score`; `f10-export`; INV-1/INV-2 |

## 1. Objetivo / user story

Como responsable de compliance o arquitectura en una organización regulada,
quiero evidencia local y reproducible de que las specs cumplen controles
(OWASP API Top 10 2023, GDPR) para entregársela a un auditor sin subir ninguna
spec a la nube.

Dos piezas: (a) detección determinista de PII obvia en `example`/`examples`;
(b) mapeo declarativo finding → control visible en `export`.

## 2. Decisiones (2026-09-30, delegadas por el dueño con el arranque de T2)

| Tema                       | Decisión                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| Frameworks v0              | `owasp-api` (Top 10 **2023**) + `gdpr` (art. 25 y 32)                       |
| Dónde viven las reglas     | **Dentro del pack elite** (`rules/privacy.yaml`), no en un pack paralelo — evita un loader multi-pack en v0; un pack separado por tier queda para F7 |
| Detección PII              | Átomo nuevo `examplePii` (spec `f1-engine` actualizada primero): email / teléfono E.164 / tarjeta Visa-MC-Amex; dominios placeholder excluidos |
| Severidad inicial          | `warning` (promoción a `error` solo con evidencia de fp-budget)             |
| Mappings                   | `packs/elite/compliance-mappings.yaml` versionado junto al pack: catálogo de controles por framework + `ruleId → [framework:control]` |
| Lenguaje                   | "evidencia de revisión", nunca "certificación"                              |

## 3. Contrato

### Regla nueva (elite 96)

- `PRIV-001` (category `security`, severity `warning`): "Examples must not
  contain obvious PII (real-looking emails, phone numbers, card numbers)."
  Fuente: GDPR art. 5(1)(c) data minimisation (EUR-Lex).

### compliance-mappings.yaml (v1)

```yaml
version: 1
frameworks:
  owasp-api:
    - { id: "API1:2023", title: "Broken Object Level Authorization" }
    # … API1..API10 (catálogo completo: los controles sin findings aparecen pass)
  gdpr:
    - { id: "art. 25", title: "Data protection by design and by default" }
    - { id: "art. 32", title: "Security of processing" }
mappings:
  - ruleId: PRIV-001
    controls: ["owasp-api:API3:2023", "gdpr:art. 25"]
  # … mapping curado y defendible solo (SEC-001..004, AUTH-001..004, PRIV-001)
```

### export

```bash
ankaa export report.json --controls owasp-api,gdpr [--out integration.json]
```

- `--controls <csv>`: frameworks permitidos `owasp-api | gdpr`; desconocido ⇒
  exit 2. Sin el flag, el output es idéntico al de hoy (aditivo).
- El output suma `controls[]`: por cada framework pedido, **todos** los
  controles del catálogo — `{framework, control, title, status: pass|fail,
  findings: [fingerprint]}` — `fail` si ≥ 1 finding mapeado. Orden:
  framework (orden pedido) → id de control.
- Los mappings se cargan del pack elite embebido (mismo mecanismo que las
  reglas); sin red (INV-1).

## 4. Alcance (in / out)

### In (M17.5)

- Átomo `examplePii` (whitelist `f1-engine` + coverage class `response`).
- `PRIV-001` en elite (95 → 96 reglas activas) + CHANGELOG del pack.
- `compliance-mappings.yaml` con catálogo OWASP API 2023 + GDPR y mapping
  curado de las reglas de seguridad/privacidad.
- `export --controls` con `controls[]` aditivo (schemaVersion sigue 1).

### Out (v0) — follow-ups documentados

- `PRIV-002` identificadores nacionales **configurables** (requiere patterns
  por config → cambio de schema de config + átomo parametrizado).
- Frameworkes extra (SOC2, ISO 42001), packs compliance por cliente (F7),
- Validación de ejemplos contra schemas (ya cubierto por el draft
  `f13-mini-validator`).
- Detección de PII en tráfico real (Ankaa es offline: solo specs).

## 5. Criterios de aceptación

- [x] AC-CP.1 Átomo `examplePii`: true con email/teléfono/tarjeta reales;
      false con `user@example.com`, placeholders (`string`, `{email}`) y spec
      limpia.
- [x] AC-CP.2 `PRIV-001` dispara en fixture con PII en examples (determinista,
      mismo fingerprint entre corridas); no dispara en fixtures existentes
      (golden intacto, 0 findings nuevos).
- [x] AC-CP.3 `export --controls owasp-api,gdpr` lista **todos** los controles
      del catálogo; los mapeados con findings quedan `fail` con fingerprints;
      el resto `pass`.
- [x] AC-CP.4 Framework desconocido o mappings faltantes/inválidos ⇒ exit 2
      con mensaje claro.
- [x] AC-CP.5 Sin `--controls` el output no cambia (compatibilidad v1).
- [x] AC-CP.6 Determinismo: mismo reporte ⇒ mismo `controls[]` (orden estable).
- [x] AC-CP.7 `pnpm check` e invariantes verdes (INV-1: export sigue sin red).

## 6. Test plan

| Caso                                                       | Tipo |
| ---------------------------------------------------------- | ---- |
| Átomo true/false (email real vs placeholder, E.164, tarjeta) | unit (core) |
| PRIV-001 en fixture PII + no-regresión golden              | e2e (cli) |
| `export --controls` pass/fail/orden/exit codes             | e2e (cli) |

## 7. Dependencias

- `f1-engine` (whitelist + coverage: átomo nuevo ya agregado a la spec).
- `f10-export` (IntegrationExport v1; `controls` es aditivo).

## 8. Riesgos y notas

- FP del regex es el riesgo #1: severidad `warning` + promoción solo con
  evidencia fp-budget (AC-CP.2 fija fixtures sin PII para evitar ruido).
- Catálogo OWASP congelado a 2023; nueva edición ⇒ bump del mappings + changelog.
- Mapping curado mínimo y defendible; no mapear todo "para llenar".

## Changelog

- 2026-09-30: draft inicial desde el backlog f17.
- 2026-09-30: decisiones delegadas por el dueño (arranque T2): frameworks v0
  OWASP API 2023 + GDPR; reglas PRIV-* dentro del pack elite (sin loader
  multi-pack); `PRIV-002` configurable queda follow-up. Scope ajustado con
  honestidad → `ready`.
- 2026-09-30 · M17.5 implementado: átomo `examplePii` (core, con spec de
  `f1-engine` primero) + `PRIV-001` (elite 96) +
  `compliance-mappings.yaml` v1 + `export --controls` aditivo + tests
  (core 3 + cli 6; golden y thresholds intactos) · `pnpm check` verde ·
  estado → `implementada`. Limitación documentada: v0 inspecciona examples
  que el parser preserva (nivel schema).
