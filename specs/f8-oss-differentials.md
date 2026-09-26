# f8-oss-differentials · Diferenciales del producto open source (LLM opcional, drift, batch, multi-protocolo)

| Campo | Valor |
|---|---|
| Estado | draft (backlog — se abre al arrancar el giro open source; ejecuta ANTES que f7 si se confirma) |
| Fecha | 2026-09-26 |
| Fase | 8 |
| Deriva de | Re-priorización 2026-09-26 (open source "de chill"); specs `f6-distribution` (config LLM), `f1-openapi` (modelo Spec); SDD anti-alcance (no linter de código) |

## 1. Objetivo

Convertir ApiGovScan en un **plano de governance multi-protocolo** con diferenciales propios que ningún competidor tiene (más allá de "gratis y corre local"). La IA es siempre **opcional** (env/config `llm.baseUrl`); sin ella el producto funciona como hoy (INV-1/INV-3 intactos). Regla de oro: **el LLM nunca es árbitro** — propone; el motor determinista valida y decide.

## 2. Alcance (milestones)

### M8.1 — `suggest_fix` (MCP + CLI)

- MCP tool `suggest_fix(fingerprint)`: patch propuesto del spec, groundeado en regla + cita. CLI: `apigovscan fix <spec> --dry-run` (nunca escribe sin revisión).
- Requiere LLM configurado; sin LLM → mensaje claro, exit 0.

### M8.2 — `rules import` (guideline → reglas)

- `apigovscan rules import --from <pdf|docx|md|txt>` → el LLM del cliente draftea reglas en nuestro DSL → `rules validate` determinista rechaza fruta → archivo versionado en el repo (revisión tipo PR).
- Fuentes de extracción de texto: md/txt nativo; pdf/docx con extractor.

### M8.3 — Drift spec↔código + generación

- **Sin spec en el repo** → opción de **generar** el openapi.yaml: detección de rutas por framework (Express/Nest, Spring, FastAPI/Flask, .NET) + LLM que draftea → parser determinista valida → humano revisa.
- **Con spec** → **diff de superficie API** (no del código): "falta tal endpoint", "este endpoint ya no existe", "cambió la salida (response schema)".
  - Nivel endpoint/presenta: heurísticas deterministas (cheap, confiable).
  - Nivel shape (tipos de salida): asistido por LLM sobre DTOs/returns, marcado con nivel de confianza.
- Salida siempre con opción de **regenerar** el spec (mismo flujo validado).

### M8.4 — `scan-org` (batch de organización)

- `apigovscan scan-org --github <org> [--group-by dominio]`: acceso read-only, clona/descarga local, discovery de specs, **informe consolidado**: score por repo agrupado por dominio/área/CMDB, ranking de lo peor primero.
- Es el entregable natural de una auditoría pagada.

### M8.5 — Elite pack 100+ reglas (paridad, no diferencial)

### M8.6 — Multi-protocolo (un solo plano de governance)

- El motor ya es agnóstico del formato (parser → modelo `Spec` normalizado). Cada protocolo nuevo = **adapter + pack de reglas propio curado**.
- Orden por demanda: **GraphQL SDL primero** (el "cagaste" más común; parser maduro), **AsyncAPI** después (evento, espacio menos poblado), **proto/gRPC** al final (buf es incumbente fuerte — evaluar antes de entrar).
- Pitch: no "mejor linter de GraphQL" sino **"un solo score y un solo informe para TODA tu superficie de APIs"** (REST + GraphQL + eventos) — nadie lo tiene hoy.
- Fuera: soportar todo a la vez; competir de frente con buf/Apollo en sus nichos.

## 3. Contrato (borrador — se detalla al abrir cada milestone)

- Config: `llm: { baseUrl?, apiKey?, model? }` (compatible OpenAI). Features LLM degradan limpio sin config.
- Drift: `apigovscan drift <repo> [--spec <path>]` → reporte `{missing[], removed[], changed[]}`.
- scan-org: salida JSON + markdown consolidado con score por repo.

## 4. Criterios de aceptación

A definir al abrir cada milestone (regla de oro: spec `ready` antes de codear).

## 5. Test plan

Patrón por milestone: unit + e2e CLI + invariantes INV-1/2/7 (las features LLM se testean con stub OpenAI-compatible determinista).

## 6. Dependencias

- `f6-distribution` (empaquetado; la config `llm` vive en cli, no core).
- Arquitectura de adapters (`packages/openapi` como referencia para nuevos parsers).

## 7. Riesgos y decisiones abiertas

| Tema | Nota |
|---|---|
| Extracción de rutas por framework | Mantener tabla pequeña de frameworks soportados; fallback: "no pude detectar rutas" honesto. |
| Calidad del shape-diff | Siempre con nivel de confianza; nunca bloquear gate solo por LLM. |
| GraphQL | Curación de reglas = el costo real (no el parser). |
| Hacer todo junto | Prohibido: un protocolo por vez, por demanda. |

## Changelog

- 2026-09-26 · Spec creado consolidando los diferenciales acordados (suggest_fix, rules import, drift/generación, scan-org, elite 100+, multi-protocolo GraphQL-first). Ejecuta antes que f7 si se confirma el giro open source.
