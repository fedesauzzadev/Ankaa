# f10-export · Contrato JSON para integraciones (Jira/Trello/Slack/ServiceNow del cliente)

| Campo     | Valor                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Estado    | ready                                                                                     |
| Fecha     | 2026-09-28                                                                                |
| Fase      | 10 (export; ver ADR-013)                                                                  |
| Deriva de | ADR-013; `f1-reporters` (reporte JSON); `f8-scan-org` (`--group-by` como ruteo por dueño) |

## 1. Objetivo / user story

Como arquitectura del banco que ya corre `scan-org` nocturno quiero un **JSON listo para enchufar** a Jira/ServiceNow/Slack con mis credenciales y mi red, ruteado por dueño de grupo, sin que ApiGovScan hable nunca con esos servicios. Ejemplo: cada grupo recibe sus findings nuevos como tarjetas/tickets automáticamente.

**Regla de oro:** nosotros entregamos el contrato estable; la red y las credenciales las pone el cliente bajo su riesgo. Cero adapters con secrets nuestros.

**Edición: empresarial.** El `export` ruteado por dueños es diferencial pago (ver split en `f9-launch-oss`). Como aún no existen tiers en el código (F7 en `draft`), este milestone se implementa y documenta como enterprise; el gate por tier se agrega cuando F7 los defina, sin cambiar el contrato de este spec.

## 2. Alcance

### In

- **Contrato estable versionado** `export.json` v1: `{ tool, version, exportedAt?, groups: [{ name, owners?, findings: [finding + trend vs baseline] }], summary }`. `owners` sale del `--group-by` extendido (`grupo: { owner, channel? }` o el plano actual como fallback a `ungrouped`).
- **Comando** `apigovscan export <reporte.json> [--group-by <file>] [--since <viejo.json>] [--out export.json]`: filtra (solo nuevos si hay `--since`, por fingerprint), agrupa por dueño y escribe el export. Puro, sin red, sin LLM (mismo molde que `scan.ts`).
- **Ejemplos del cliente** (documentación, no código soportado): script de 20 líneas Jira (crea issue por finding nuevo con fingerprint en label para dedupe), webhook Slack (postea resumen por grupo), CSV para ServiceNow import. Viven en `examples/integrations/` como referencia sin garantías.
- **Dedupe por fingerprint**: el export incluye `fingerprint` y `firstSeen?` para que el cliente no duplique tickets.
- **Tests**: unit del agrupador/ruteo + e2e (`export` sobre disaster-report con group-by de mentira) + determinismo (mismo input ⇒ mismo export salvo `exportedAt`, que vive fuera del hash) + INV-7 (solo `--out`).
- Docs: README (sección integraciones) + índices.

### Out

- Clients HTTP a Jira/ServiceNow/Slack/Trello en nuestro código (los escribe y opera el cliente).
- Guardar secrets/tokens (jamás; ni en config: el export no autentica nada).
- Tendencia histórica con UI (eso es `f10-dashboard`).
- Enviar mails o notificaciones desde ApiGovScan.

## 3. Contrato

```ts
// apigovscan export <report.json> [--group-by dominios.yaml] [--since viejo.json] [--out export.json]
// export.json v1: { version: 1, tool, groups: [{ name, findings: FindingEnriched[] }], summary }
// FindingEnriched = Finding + { trend: "new"|"repeated", owner?: string }
```

## 4. Criterios de aceptación

- [ ] AC-EX.1: `export disaster-report.json --group-by dominios.yaml` agrupa findings por dueño con conteos correctos.
- [ ] AC-EX.2: `--since viejo.json` deja solo findings nuevos (por fingerprint); sin `--since` exporta todo.
- [ ] AC-EX.3: determinismo: dos corridas ⇒ mismo bytes salvo `exportedAt` (o flag `--no-timestamp` para byte-idéntico).
- [ ] AC-EX.4: ejemplo Jira de `examples/` crea 1 issue por finding nuevo en un stub local (test con stub HTTP del cliente, no nuestro).
- [ ] AC-EX.5: INV-7 (solo `--out`); `pnpm check` verde; spec `cerrada` + índices.

## 5. Test plan

Unit (ruteo, dedupe, tendencia) + e2e CLI + ejemplo Jira contra stub + invariantes.

## 6. Dependencias

- Ninguna nueva. `f1-reporters`, `f8-scan-org` (group-by).

## 7. Riesgos y decisiones abiertas

| Tema                            | Decisión v1                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| Formato del group-by extendido  | Acepta plano actual (`repo: grupo`) y extendido (`grupo: {owner, channel}`); inválido → exit 2. |
| `exportedAt` rompe determinismo | Va en metadata fuera del contenido comparable + flag `--no-timestamp`.                          |
| Ejemplos que se pudren          | Sin garantías, con disclaimer y test solo del de Jira contra stub.                              |

## Changelog

- 2026-09-28 · Spec creada en `draft` (handoff vía AGENTS.md + este spec).
- 2026-09-28 · Revisada por el dueño → `ready`: edición empresarial (gate por tier cuando F7 los defina).
