# Tasks · f17-lsp

Plan: [plans/f17-lsp.md](../plans/f17-lsp.md) · Spec: [specs/f17-lsp.md](../specs/f17-lsp.md)

## M17.8a — posiciones (M17.7b)

- [x] `@ankaa/openapi`: `spec.positions` (CST parseDocument, regla 5b, cap 20k)
- [x] `@ankaa/core`: `Finding.position?` + `attachPositions` (fuera del fingerprint)
- [x] CLI: attach post-evaluate en analyze y validate-examples
- [x] Reporters: checkstyle/sarif/codequality consumen position (fallback intacto)
- [x] Tests: posiciones + fingerprints golden + reporters
- [x] `pnpm check` verde

## M17.8b — server LSP

- [x] `packages/lsp`: JSON-RPC stdio hand-rolled (framing, handshake, sync full, diagnostics)
- [x] CLI `ankaa lsp`: analyze in-memory con paridad, debounce 300ms, cache content-hash
- [x] Docs por editor (Neovim/Helix/Zed/Emacs/VS Code genérico) + README
- [x] Tests: paridad CLI-vs-LSP, debounce, spec inválido, INV-1, determinismo
- [x] `pnpm check` verde
- [x] Specs → `implementada` + changelog backlog f17
