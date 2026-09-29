# f7-enterprise · Packs por cliente, self-host completo y edge (Cloudflare)

| Campo     | Valor                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Estado    | draft (backlog guardado — se abre cuando se arranque)                                                          |
| Fecha     | 2026-09-26                                                                                                     |
| Fase      | 7 (consolida todo lo pendiente de F6 + el Cloudflare del SDD original)                                         |
| Deriva de | SDD §7 fases 6–7 originales; re-priorización 2026-09-26; FR-52, FR-61/62/63; specs `f6-distribution` (cerrada) |

## 1. Objetivo / user story

Como organización con ApiGovScan instalado quiero (a) **mis propios packs de reglas** versionados y distribuibles internamente, (b) un **self-host completo** (docker compose) que sirva packs sin depender de nada externo, y (c) opcionalmente el **edge de Cloudflare** para curación de fuentes y MCP remoto de consulta.

**Consolidación (2026-09-26):** todo lo que faltaba vive acá como **una sola fase** — F6 quedó cerrada en `v0.6.0-private` (score + licencia + tarball/registry/Docker).

## 2. Alcance (in / out)

### In — M7.1 Packs por cliente

- Packs internos versionados (`packs/<org>-<pack>/` con `pack.yaml` + `rules/`, mismo schema que elite).
- `apigovscan standards list|info` ve packs embebidos + internos; config `standards.packs: [elite, acme-security]`.
- `--pack <id>` en CLI; distribución del pack interno vía el mismo tarball/registry de f6-distribution.
- Tests: pack interno carga, reglas propias fallan/desactivan igual que elite, dedupe de ids entre packs.

### In — M7.2 Self-host completo (compose)

- `docker-compose.yml`: registry de packs (estático, nginx/caddy) + CLI + docs de uso interno.
- El CLI consume packs del registry self-hosteado (download + cache local, siempre con fallback al pack embebido — jamás red durante `analyze` si ya está cacheado).
- `standards update|pin` contra el registry interno (FR-61/62 adaptado a self-host).
- Docs: `docs/05 §4.2` actualizada al compose real.

### In — M7.3 Edge Cloudflare (opcional, mismo paquete de fase)

- Worker de fuentes (cron semanal → draft de pack con changelog, FR-62).
- Distribución de packs vía R2/KV; MCP remoto **solo consulta** (`list_packs`, `explain_rule`, `get_pack` — FR-52, jamás analiza specs remotos).
- Canales `stable`/`canary` (FR-63).

### In — M7.4 Export enterprise (absorbido de ex-M10.2)

- Comando `apigovscan export <reporte.json> [--group-by <file>] [--since <viejo.json>] [--out export.json]`: contrato `export.json` v1 ruteado por dueño, solo nuevos con `--since` (dedupe por fingerprint), determinista salvo `exportedAt`.
- `examples/integrations/` (jira/stub, slack, csv) como referencia sin garantías.
- Puro, sin red, sin LLM; el gate por tier se agrega cuando F7 los defina, sin cambiar el contrato.
- Spec de detalle: `f10-export` (conserva el nombre por trazabilidad; su milestone es M7.4).

### Out

- SaaS multi-tenant, telemetría, phone-home (INV-1 se mantiene).
- Historial/tendencia de score con UI (candidato a M7.5 o fase 8 si el cliente lo pide).
- Firma Ed25519 de licencias (queda el upgrade documentado en f6-distribution §7).

## 3. Contrato (borrador — se detalla al abrir cada milestone)

- Config: `standards.packs: string[]` (default `[elite]`); paths de packs internos vía config o envoltura del tarball.
- CLI: `--pack <id>` repetible; `standards` pasa de "borde" a comando real.
- Registry self-host: índice estático `packs/index.json` + `<pack>@<version>/` inmutables.

## 4. Criterios de aceptación

A definir al abrir el milestone correspondiente (regla de oro: spec `ready` antes de codear).

## 5. Test plan

A definir por milestone (patrón: unit + e2e CLI + invariants INV-1/2/7).

## 6. Dependencias

- `f6-distribution` (canal tarball/registry), `f1-elite-pack` (schema de pack), `f2-config` (schema strict).

## 7. Riesgos y decisiones abiertas

| Tema                          | Nota                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| Red en `analyze`              | Sigue prohibida (INV-1): packs se cachean local; update es explícito. |
| Dedupe de ruleIds entre packs | Error de pack (mismo criterio que custom rules vs elite).             |
| CF opcional                   | M7.3 se puede postergar sin romper M7.1/M7.2.                         |

## Changelog

- 2026-09-26 · Spec creado consolidando el pendiente (packs por cliente, self-host, Cloudflare) en una única fase 7; F6 declarada cerrada en `v0.6.0-private`.
- 2026-09-29 · Absorbe ex-M10.2 como M7.4 (export enterprise, spec `f10-export` en `ready`); tendencia con UI pasa a candidata M7.5.
