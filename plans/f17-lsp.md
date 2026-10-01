# Plan f17-lsp · `ankaa lsp` (feedback en editor)

| Campo     | Valor                                             |
| --------- | ------------------------------------------------- |
| Estado    | completada                                          |
| Fase      | 17 (backlog [f17](f17-diferenciales.md) T3 #8)   |
| Fecha     | 2026-10-01                                        |
| Deriva de | [spec f17-lsp](../specs/f17-lsp.md) (`ready`)    |

## M17.8a — posiciones (M17.7b activado)

1. `@ankaa/openapi`: `spec.positions` vía CST de `yaml#parseDocument`
   (regla 5b f1-openapi: clave del map / inicio del item, 1-based, cap 20k).
2. `@ankaa/core`: `Finding.position?` (fuera del fingerprint) +
   `attachPositions(findings, spec)` exact-match por pointer.
3. CLI: enriquecer post-`evaluate` en `analyze` y `validate-examples`.
4. Reporters: checkstyle line/column reales + message sin suffix; sarif
   `region.startLine/startColumn`; codequality `lines.begin` real. Junit sin
   cambios.
5. Tests: posiciones (clave/seq/alias/cap/determinismo), fingerprints
   intactos (golden), reporters con y sin position.

## M17.8b — server LSP

1. `packages/lsp` (protocolo puro, cero deps): JSON-RPC framing
   Content-Length, handshake, didOpen/didChange/didSave con debounce
   (default 300 ms) + cache content-hash, publishDiagnostics, shutdown/exit.
   Handlers inyectados (`analyze(content) → findings | parseError`).
2. `ankaa lsp` (CLI): in-memory analyze (mismos packs/skills que CLI ⇒
   paridad), severidades error→1/warning→2/info→3, `source: "ankaa"`,
   `code: ruleId`, range desde `position` (fallback 0,0).
3. Docs por editor: Neovim/Helix/Zed/Emacs + VS Code genérico.
4. Tests: harness client fixture, paridad CLI-vs-LSP, debounce sin dupes,
   spec inválido honesto, INV-1 sin fetch, determinismo.

## Definition of done

- AC-LSP.1..5 verdes; `pnpm check` + invariantes verdes; specs →
  `implementada` (f17-lsp; f17-ci-reporters §8 marca M17.7b activo).

## Changelog

- 2026-10-01 · Plan creado con las 4 decisiones del dueño cerradas (spec §7).
- 2026-10-01 · M17.8a+M17.8b completos: posiciones (openapi+core+reporters,
  fingerprints intactos por golden) y server LSP (16 tests nuevos) ·
  AC-LSP.1..5 verdes, `pnpm check` verde.
