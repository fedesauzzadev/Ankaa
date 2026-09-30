# f17-compliance-pack · Evidencia de compliance offline (PII + mapeo a controles)

| Campo     | Valor                                                    |
| --------- | -------------------------------------------------------- |
| Estado    | draft                                                    |
| Fase      | 17                                                       |
| Fecha     | 2026-09-30                                               |
| Deriva de | SDD §8 (privacidad); [f6-score](f6-score.md); [f10-export](f10-export.md); INV-1/INV-2 |

## 1. Objetivo / user story

Como responsable de compliance o arquitectura en una organización regulada,
quiero evidencia local y reproducible de que las specs cumplen controles
(OWASP API Top 10, GDPR data-minimization) para entregársela a un auditor sin
subir ninguna spec a la nube.

Dos piezas: (a) reglas deterministas de minimización de datos sobre
`example`/`default`; (b) mapeo declarativo finding → control visible en
`export`.

## 2. Alcance (in / out)

### In

- Pack `compliance` v0 (propuesta):
  - `PRIV-EX-001`: PII obvia en `example`/`examples` (email, teléfono,
    tarjeta de crédito, coordenadas) — patterns fijos, severidad `warning`
    inicial.
  - `PRIV-EX-002`: identificadores nacionales configurables (lista de
    patterns por config, p. ej. DNI) en `example`/`default`.
  - Reuso (o versión pack) de regla elite existente: operaciones sin
    `security` declarado ni override global.
- `compliance-mappings.yaml` versionado junto al pack:
  `ruleId → [{framework, control, title, source}]`.
- `ankaa export report.json --controls owasp-api,gdpr` agrega sección
  `controls[]` con findings por control y **controles sin findings listados
  como `pass`** (evidencia de revisión, no solo de falla).
- Mapeo inicial de reglas elite existentes (SEC-\*, ERR-\*) a OWASP API
  Top 10 2023 donde aplique.

### Out

- "Certificar" cumplimiento legal o emitir sellos.
- Telemetría, envío a auditores, portales.
- Reglas que requieran red o LLM.
- Detección de PII en tráfico real (Ankaa es offline: solo specs).

## 3. Contrato (interfaces, schemas, UX)

- Export JSON v2 (sumar, no romper v1):
  `controls: [{framework, control, title, status: pass|fail, findings: [fingerprint]}]`.
- Patterns de PRIV-EX-002: `ankaa.yaml → compliance.privacyPatterns:
  [{id, pattern, description}]`, validados con límite de complejidad
  (rechazar regex catastrófica).
- Mensajes de findings en inglés, cita de fuente obligatoria (AGENTS.md §5).

## 4. Criterios de aceptación (preliminares)

- [ ] AC-CP.1 Fixture con emails/teléfonos/tarjetas en examples genera
      PRIV-EX-001 determinista (mismo hash entre corridas).
- [ ] AC-CP.2 export con `--controls` lista los frameworks pedidos; control
      sin findings aparece `pass` con las reglas evaluadas.
- [ ] AC-CP.3 regex custom inválida o catastrófica → exit 2 con mensaje claro.
- [ ] AC-CP.4 FP de las reglas PRIV-\* medido con fp-budget antes de subir
      severidad.
- [ ] AC-CP.5 Invariantes y `pnpm check` verdes.

## 5. Test plan

- Fixtures privacy positivos/negativos (incluye falsos candidatos: hashes,
  UUIDs, placeholders `{email}` que no deben matchear).
- e2e export con `--controls`, snapshots de determinismo, invariantes.

## 6. Dependencias

- `f10-export` (cerrada): contrato JSON v1; v2 suma sin romper.
- Recomendado: `f8-fp-budget` para calibrar severidad de las regex.

## 7. Riesgos y decisiones abiertas

- FP de regex es el riesgo #1: iniciar en `warning` y promover con evidencia.
- Lenguaje honesto: "evidencia de revisión", nunca "certificación".
- ¿Qué frameworks en v0? Propuesta: OWASP API Top 10 2023 + GDPR art. 25/32.
- Versionado del mapping ante nuevas ediciones de OWASP.

## Changelog

- 2026-09-30: draft inicial desde el backlog f17
  ([plan](../plans/f17-diferenciales.md)).
