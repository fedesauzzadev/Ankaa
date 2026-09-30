# f10-export · Contrato JSON para integraciones (Jira/Trello/Slack/ServiceNow del cliente)

| Campo     | Valor                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                   |
| Fecha     | 2026-09-28                                                                                |
| Fase      | 7 (M7.4 export enterprise, absorbido de ex-M10.2; ver ADR-013)                            |
| Deriva de | ADR-013; `f1-reporters` (reporte JSON); `f8-scan-org` (`--group-by` como ruteo por dueño) |

## 1. Objetivo / user story

Como arquitectura del banco que ya corre `scan-org` nocturno quiero un **JSON listo para enchufar** a Jira/ServiceNow/Slack con mis credenciales y mi red, ruteado por dueño de grupo, sin que ApiGovScan hable nunca con esos servicios. Ejemplo: cada grupo recibe sus findings nuevos como tarjetas/tickets automáticamente.

**Regla de oro:** nosotros entregamos el contrato estable; la red y las credenciales las pone el cliente bajo su riesgo. Cero adapters con secrets nuestros.

**Edición: empresarial.** El `export` ruteado por dueños es diferencial pago (ver split en `f9-launch-oss`). Como aún no existen tiers en el código (F7 en `draft`), este milestone se implementa y documenta como enterprise; el gate por tier se agrega cuando F7 los defina, sin cambiar el contrato de este spec.

## 2. Alcance

### In

- **Contrato estable versionado** `export.json` v1: `{ tool, schemaVersion: 1, version, groups: [{ name, findings: [finding + trend] }], summary }`. `version` identifica la versión del CLI y `schemaVersion` la del contrato. `--group-by` reusa el mapping simple `spec path: owner/team` del dashboard; cada valor es el nombre del grupo; unmatched → `ungrouped`.
- **Comando** `apigovscan export <reporte.json> [--group-by <file>] [--since <viejo.json>] [--out export.json]`: agrupa por dueño y marca cada finding como `new` o `repeated` por fingerprint; `--since` no filtra repetidos. Puro, sin red, sin LLM (mismo molde que `scan.ts`).
- **Ejemplos del cliente** (documentación, no código soportado): script de 20 líneas Jira (crea issue por finding nuevo con fingerprint en label para dedupe), webhook Slack (postea resumen por grupo), CSV para ServiceNow import. Viven en `examples/integrations/` como referencia sin garantías.
- **Comparación por fingerprint**: `--since` compara fingerprints; el export incluye `fingerprint` y `trend: new|repeated`, tanto los nuevos como los repetidos. `firstSeen` queda fuera porque no hay almacenamiento de historial en ApiGovScan.
- **Tests**: unit del agrupador/ruteo + e2e + ejemplo Jira contra stub HTTP local + determinismo (mismo input ⇒ mismos bytes) + INV-7 (solo `--out`).
- Docs: README (sección integraciones) + índices.

### Out

- Clients HTTP a Jira/ServiceNow/Slack/Trello en nuestro código (los escribe y opera el cliente).
- Guardar secrets/tokens (jamás; ni en config: el export no autentica nada).
- Tendencia histórica con UI (eso es `f10-dashboard`).
- Enviar mails o notificaciones desde ApiGovScan.

## 3. Contrato

```ts
// apigovscan export <report.json> [--group-by dominios.yaml] [--since viejo.json] [--out export.json]
// export.json v1: { tool: "apigovscan", schemaVersion: 1, version, groups: [{ name, findings: FindingEnriched[], summary }], summary }
// FindingEnriched = Finding + { trend: "new"|"repeated", owner?: string }
```

## 4. Criterios de aceptación

- [x] AC-EX.1: `export disaster-report.json --group-by dominios.yaml` agrupa findings por dueño con conteos correctos.
- [x] AC-EX.2: `--since viejo.json` etiqueta findings como nuevos o repetidos por fingerprint y exporta ambos; sin `--since` todo finding se marca `new`.
- [x] AC-EX.3: determinismo: dos corridas ⇒ mismos bytes, sin timestamp.
- [x] AC-EX.4: ejemplo Jira de `examples/` crea 1 issue por finding nuevo en un stub HTTP local.
- [x] AC-EX.5: INV-7 (solo escribe a `--out`); tests focalizados, `pnpm check` verde e índices actualizados.

## 5. Test plan

Unit (ruteo, dedupe, tendencia) + e2e CLI + ejemplo Jira contra stub + invariantes.

## 6. Dependencias

- Ninguna nueva. `f1-reporters`, `f8-scan-org` (group-by).

## 7. Riesgos y decisiones abiertas

| Tema                            | Decisión v1                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Formato del group-by            | Reusa mapping plano de dashboard `spec-path: owner/group`; inválido → exit 2. |
| `exportedAt` rompe determinismo | Se omite en v1; output byte-idéntico para los mismos inputs.                  |
| Ejemplos que se pudren          | Sin garantías, con disclaimer y test solo del de Jira contra stub.            |

## Changelog

- 2026-09-28 · Spec creada en `draft` (handoff vía AGENTS.md + este spec).
- 2026-09-28 · Revisada por el dueño → `ready`: edición empresarial (gate por tier cuando F7 los defina).
- 2026-09-29 · Reubicada a F7 como M7.4 (ex-M10.2): el export enterprise es diferencial pago y vive con F7; el archivo conserva el nombre por trazabilidad.
- 2026-09-30 · Contrato v1 acotado: mapping por spec path reusa dashboard; sin `firstSeen` ni timestamp (no hay historial que los sustente; output determinista por defecto).
- 2026-09-30 · Implementada M7.4: `--since` clasifica `new`/`repeated` sin descartar repetidos; JSON v1 determinista, ejemplos de cliente y tests unit/e2e. El gate por tier sigue pendiente de F7.
