# Tasks · f4-mcp

Plan: [plans/f4-mcp.md](../plans/f4-mcp.md) · Specs: `f4-mcp-server`, `f4-mcp-tools`

---

## M4.1 — Server + tools core (f4-mcp-server + tools parcial)

- [x] Dep `@modelcontextprotocol/sdk` en `packages/mcp` (no core)
- [x] `McpToolHandlers` + `ToolResult` + `createMcpServer` + `startStdioServer`
- [x] Schemas de 5 tools registrados en `tools/list`
- [x] `resolveSandboxPath(cwd, input)` rechaza fuera de cwd
- [x] `DEFAULT_MAX_FINDINGS` + helper de truncación
- [x] Handlers CLI: `analyze_spec`, `list_rules`, `explain_rule`
- [x] Comando `apigovscan mcp` (+ `--help`) en dispatcher
- [x] Tests AC-SRV.1–3 + AC-T.1, T.3–T.6
- [x] Spec f4-mcp-server → `implementada` (parcial o full según AC)

---

## M4.2 — Tools restantes + cierre fase 4

- [x] Handler `validate_custom_rules` (AC-T.7)
- [x] Handler `explain_finding` report+fingerprint (AC-T.8–9)
- [x] Truncación analyze_spec (AC-T.2)
- [x] Paridad CLI vs tool (AC-T.10)
- [x] Statelessness + INV-1 e2e MCP (AC-SRV.4–5)
- [x] E2E S5: analyze_spec + explain con cita source
- [x] README/índices/help docs `mcp` (AC-SRV.6, AC-T.11)
- [x] `pnpm check` verde
- [x] Specs f4-* → `cerrada`
- [x] DoD plans/f4-mcp.md
- [x] Tag `v0.4.0-mcp`
