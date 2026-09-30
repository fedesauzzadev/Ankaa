# f10-dashboard · Visor local de reportes + tracking (loopback, sin nube)

| Campo     | Valor                                                                                 |
| --------- | ------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                               |
| Fecha     | 2026-09-28                                                                            |
| Fase      | 10 (visor local; ver ADR-013)                                                         |
| Deriva de | ADR-013; SDD §4 (enmienda visor ≠ portal); `f1-reporters` (reporte JSON como entrada) |

## 1. Objetivo / user story

Como responsable de APIs con un `report.json` de 112 findings quiero `apigovscan dashboard report.json` y ver tarjetas lindas en mi navegador, agruparlas y trackearlas (pendiente → en curso → resuelto), con un segundo análisis que verifique contra el anterior. Todo en mi PC, sin cuentas ni nube.

**Regla de oro:** solo un visualizador lindo. No analiza, no puntúa, no decide: lee JSON.

**Edición: todos (OSS + enterprise).** El dashboard es parte del producto gratuito.

## 2. Alcance

### In

- **Comando** `apigovscan dashboard <reporte.json> [--port <n>] [--tracking <file>]`: script Node cross-OS que sirve en `127.0.0.1` (loopback-only, puerto efímero o fijo con `--port`; nunca `0.0.0.0` por default) una app estática de un solo HTML (sin frameworks pesados, sin build: HTML+JS plano como el playground de referencia).
- **Tarjetas por finding**: regla, severidad, mensaje, fix, fuente con URL, `apiLocation`, fingerprint corto. Filtros de texto + severidad.
- **Agrupadores**: por pack/API (elite, graphql, grpc, asyncapi, webhooks), por grupo de dueño (`--group-by`, mismo formato que `scan-org`), por regla, por archivo de spec, por severidad. Extra propios: **por tendencia** (nuevo / repetido / resuelto al comparar dos reportes por fingerprint) y **por estado de tracking**.
- **Tracking local**: sidecar `<reporte>.tracking.json` (explícito, INV-7) con `{ fingerprint: { status, updatedNote? } }`; estados `pending|in_progress|resolved`. Segundo run cruza fingerprints: desaparecido + `resolved` = verificado; desaparecido sin marcar = avisa; nuevo = regresión.
- **Comparar dos reportes**: `apigovscan dashboard nuevo.json --against viejo.json` (o selector en UI).
- **Diseño visual** (requisito, no decoración):
  - Capitalización: chrome de la UI en sentence case ("Mark in progress"); mensajes/fix de reglas intactos en su inglés original.
  - Color: paleta fija por severidad (error/warning/info) + neutros; texto con contraste AA sobre fondo claro cálido; nada de rojo puro sobre blanco ni combinaciones que vibren.
  - Lectura de mucho texto: system font stack, `line-height ≥ 1.5` en descripciones, medida máxima ~70ch en tarjetas, números tabulares en conteos.
  - Fluidez: filtros con debounce, paginado de 100 tarjetas, sin layout shift al filtrar, todo inline en un solo HTML (carga instantánea en loopback).
- **Tests**: e2e (levanta el server, pide `/`, aserta 200 + JSON embebido; tracking roundtrip; loopback-only por construcción); INV-7 (solo escribe el sidecar explícito); sin red externa (el HTML no carga CDN: todo inline/vendorizado).
- Docs: README (sección dashboard) + índices.

### Out

- Auth multi-usuario, nube propia, SaaS, telemetría (si aparece, caduca ADR-013).
- Mutar specs o aplicar fixes desde el dashboard (solo visualiza + trackea; `fix` sigue en CLI).
- Integraciones con tickets (eso es `f10-export`).

## 3. Contrato

```ts
// CLI: apigovscan dashboard <report.json> [--port 0] [--tracking <file>] [--against <old.json>] [--group-by <owners.yaml>] [--group-by <file>]
// Tracking sidecar: { version: 1, states: Record<fingerprint, { status: "pending"|"in_progress"|"resolved", note?: string }> }
// Server: http Node puro, bind 127.0.0.1, GET / (HTML inline), GET /api/report (el JSON), GET/POST /api/tracking (el sidecar)
```

## 4. Criterios de aceptación

- [ ] AC-DB.1: `dashboard report.json` levanta en loopback y `GET /` devuelve 200 con las tarjetas (smoke con el disaster-report de 112 findings).
- [ ] AC-DB.2: agrupadores pack + dueño + regla + archivo + severidad + tendencia + tracking, con conteos correctos contra el JSON.
- [ ] AC-DB.3: marcar `in_progress`/`resolved` persiste en el sidecar explícito; reabrir el dashboard lo conserva.
- [ ] AC-DB.4: `--against` clasifica nuevo/repetido/resuelto por fingerprint; determinista (mismo par ⇒ misma vista).
- [ ] AC-DB.5: no escucha en interfaces externas (bind 127.0.0.1); el HTML no pide red (test: sin CDN, todo inline).
- [ ] AC-DB.6: INV-7 (solo escribe sidecar); `pnpm check` verde; spec `cerrada` + índices.
- [ ] AC-DB.7: revisión visual manual (checklist): sentence case en chrome, paleta por severidad consistente, contraste legible, 112 findings del disaster sin tirones al filtrar/paginar.
- [ ] AC-DB.8: `--port` fijo ocupado ⇒ exit 2 con hint a `--port 0` (sin stack crudo).

## 5. Test plan

E2E CLI (server efímero + fetch a `/` y `/api/*`) + unit del comparador por fingerprint + boundary/INV. Fixture: el disaster-report (o subset commiteado chico).

## 6. Dependencias

- Ninguna nueva (`node:http` del runtime; UI sin deps). `f1-reporters` (formato JSON de entrada).

## 7. Riesgos y decisiones abiertas

| Tema                             | Decisión v1                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| XSS desde mensajes de reglas     | Todo texto se escapa al renderizar (los mensajes son nuestros, pero el sidecar trae `note` del usuario). |
| Reportes gigantes (10k findings) | Paginación/filtros en cliente; el server no pagina (slice 1).                                            |
| Puerto ocupado                   | `--port 0` = efímero + imprime la URL; si el fijo está ocupado, error honesto que sugiere `--port 0`.    |

## Changelog

- 2026-09-28 · Spec creada en `draft` (handoff vía AGENTS.md + este spec).
- 2026-09-28 · Revisada por el dueño → `ready`: edición OSS para todos + requisitos de diseño visual (AC-DB.7).
- 2026-09-28 · M10.1 implementado → `cerrada` (AC-DB.1–7 verdes; demo en vivo con disaster-report 112 findings; `pnpm check` verde). Notas: `ownerOf` con match por prefijo/basename/inputs; `loadReportFile` aliased en `index.ts` (colisión silenciosa con `learn.ts` en el bundle — verificado); boundary ampliado para el `fetch` same-origin del HTML.
- 2026-09-29 · Hint amable en puerto ocupado (AC-DB.8): el error sugiere `--port 0`.
- 2026-09-29 · Botón "Copy prompt for LLM" por tarjeta: copia un prompt preformateado (regla, severidad, mensaje, fix hint, endpoint, spec pointer, fuente; sin contenido del spec) para pegar en cualquier LLM. Solo clipboard local, sin red ni mutación: sigue dentro del "solo visualiza + trackea".
- 2026-09-29 · Botón "Copy fix command" por tarjeta: copia `apigovscan fix "<spec>" --fingerprint <12 chars>` listo para pegar en terminal (el CLI ahora acepta prefijos únicos).
- 2026-09-29 · Botón "Copy suppress command" por tarjeta: copia `apigovscan suppress --report "<reporte>" --fingerprint <12 chars> --decision wontfix --reason "..."` (el usuario completa decisión y motivo en terminal; el servidor expone `reportFile` en `/api/report`). Solo clipboard, sin mutación.
- 2026-09-30 · "Copy prompt for LLM" incluye los `examples` (bad/good) del finding cuando el reporte los trae (AC-E.13); sin ejemplos el prompt es idéntico al anterior.
