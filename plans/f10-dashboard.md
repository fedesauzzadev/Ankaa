# Plan · f10-dashboard · Visor local + tracking (M10.1, OSS)

| Campo        | Valor                                                |
| ------------ | ---------------------------------------------------- |
| Specs        | f10-dashboard                                        |
| Dependencias | Ninguna nueva (`node:http` del runtime; UI sin deps) |

## M10.1 — Comando + UI single-file + tracking

1. CLI `dashboard` (server loopback `node:http`, rutas `/`, `/api/report`, `/api/tracking`) + `src/dashboard.ts` + HTML inline (`src/dashboard.html.ts`: CSS + JS, paleta por severidad, sentence case, paginado 100, debounce).
2. Sidecar tracking + comparador por fingerprint (`--against`).
3. Fixture chica commiteada (subset del disaster) + e2e + INV-7.
4. README + índices. Revisión visual manual (AC-DB.7) con el disaster real.
5. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-DB.1—7 verdes.

## Notas para el agente

- Sin frameworks, sin CDN, sin build de UI: un string TS.
- Escapar todo texto de usuario (`note`) al renderizar.
- Commits sin comillas dobles embebidas (quirk PowerShell).

## Changelog del plan

- 2026-09-28 · Plan inicial (handoff).
