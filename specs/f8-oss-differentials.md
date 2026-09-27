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

- **Sin spec en el repo** → opción de **generar** el openapi.yaml. Detección de rutas en **cualquier codebase** (moderno o legacy), por capas:
  1. **Catálogo de firmas determinista** (precisión alta): patrones de routing de frameworks modernos Y legacy — Express/Nest/Fastify, Spring/JAX-RS, .NET (MVC/WebAPI/WCF/ashx), FastAPI/Flask/Django, Sinatra/Rails, Go (net/http, gorilla, gin, echo), PHP (Laravel/Symfony), y crece con cada uno que se agregue.
  2. **Barrido LLM universal (fallback)**: para frameworks propios/no reconocidos, el LLM del cliente recorre los candidatos y devuelve endpoints normalizados **con nivel de confianza**.
  3. Todo es **draft**: validador determinista de forma + revisión humana. Nunca escritura directa.
- **Con spec** → **diff de superficie API** (no del código): "falta tal endpoint", "este endpoint ya no existe", "cambió la salida (response schema)".
  - Nivel endpoint/presenta: heurísticas deterministas (cheap, confiable).
  - Nivel shape (tipos de salida): asistido por LLM sobre DTOs/returns, marcado con nivel de confianza.
- Salida siempre con opción de **regenerar** el spec (mismo flujo validado).

### M8.4 — `scan-org` (batch de organización)

- `apigovscan scan-org --github <org> [--group-by dominio]`: acceso read-only, clona/descarga local, discovery de specs, **informe consolidado**: score por repo agrupado por dominio/área/CMDB, ranking de lo peor primero.
- Es el entregable natural de una auditoría pagada.

### M8.5 — Elite pack 88 reglas (paridad, no diferencial · cerrada 2026-09-27)

### M8.6 — Multi-protocolo PRE-LANUNCH (un solo plano de governance)

**Decisión 2026-09-26 (dueño de producto):** sin apuro de salida — el producto lanza con cobertura amplia de tipos de API, no solo OpenAPI. Se construye **uno por vez, en orden**, pero todos antes del lanzamiento. Objetivo: eliminar el "pero mi empresa usa X".

El motor ya es agnóstico del formato (parser → modelo `Spec` normalizado). Cada protocolo = **adapter + pack de reglas curadas con fuentes de élite**:

| Protocolo | Fuentes de élite (curación) | Orden |
|---|---|---|
| REST/OpenAPI (hecho, 88 reglas) | Google API Design Guide, Microsoft REST Guidelines, Zalando, PayPal, Atlassian, GDS (UK) → 88 (cierre honesto sin engine nuevo) | 0 |
| **GraphQL SDL** | Shopify GraphQL Design Tutorial, Apollo Principled GraphQL, GitHub GraphQL guidelines, PayPal GraphQL standards | 1 |
| **gRPC/proto** | Google AIPs (aip.dev — el canon de diseño de APIs de Google), Buf style guide | 2 |
| **AsyncAPI + eventos** | AsyncAPI official guidelines, CloudEvents (CNCF) | 3 |
| **Webhooks** | Standard Webhooks (standardwebhooks.com) | 4 |
| SOAP/WSDL | Solo detección + aviso claro (conversión = consultoría, no producto) | borde |

- Pitch: **"un solo score y un solo informe para TODA tu superficie de APIs"** (REST + GraphQL + gRPC + eventos + webhooks) — nadie lo tiene hoy.
- Fuera: competir de frente con buf/Apollo **en sus nichos**; nosotros somos el plano unificado.

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
| Extracción de rutas en código legacy | Catálogo de firmas + fallback LLM universal con confianza; nunca prometer 100% — prometer "funciona en cualquier codebase, con revisión humana". |
| Calidad del shape-diff | Siempre con nivel de confianza; nunca bloquear gate solo por LLM. |
| GraphQL/gRPC/AsyncAPI | Curación de reglas = el costo real (no el parser); uno por vez. |
| Alcance pre-launch amplio | Riesgo de demora eterna: mitigado por orden fijo y specs por protocolo (ready → build). |

## Changelog

- 2026-09-26 · Spec creado consolidando los diferenciales acordados (suggest_fix, rules import, drift/generación, scan-org, elite 100+, multi-protocolo GraphQL-first). Ejecuta antes que f7 si se confirma el giro open source.
- 2026-09-26 · Decisión del dueño: multi-protocolo pasa a ser **pre-launch** (GraphQL → gRPC → AsyncAPI → webhooks, con fuentes de élite por protocolo); detección de rutas rediseñada como catálogo de firmas + fallback LLM universal (cualquier codebase, incl. legacy).
- 2026-09-27 · M8.6 abierto como `f8-graphql` (protocolo 1): adapter SDL → Spec + pack graphql + CLI por extensión; gRPC/AsyncAPI/webhooks quedan para M8.7+.
- 2026-09-27 · M8.7 abierto como `f8-grpc` (protocolo 2): parser proto propio (cero deps) + pack grpc + CLI por extensión.
