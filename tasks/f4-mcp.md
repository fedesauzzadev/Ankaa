# Tasks · f4-mcp

Plan: [plans/f4-mcp.md](../plans/f4-mcp.md) · Specs: `f4-mcp-server`, `f4-mcp-tools`

---

## M4.1 — Server + tools core (f4-mcp-server + tools parcial)

- [ ] Dep `@modelcontextprotocol/sdk` en `packages/mcp` (no core)
- [ ] `McpToolHandlers` + `ToolResult` + `createMcpServer` + `startStdioServer`
- [ ] Schemas de 5 tools registrados en `tools/list`
- [ ] `resolveSandboxPath(cwd, input)` rechaza fuera de cwd
- [ ] `DEFAULT_MAX_FINDINGS` + helper de truncación
- [ ] Handlers CLI: `analyze_spec`, `list_rules`, `explain_rule`
- [ ] Comando `apigovscan mcp` (+ `--help`) en dispatcher
- [ ] Tests AC-SRV.1–3 + AC-T.1, T.3–T.6
- [ ] Spec f4-mcp-server → `implementada` (parcial o full según AC)

---

## M4.2 — Tools restantes + cierre fase 4

- [ ] Handler `validate_custom_rules` (AC-T.7)
- [ ] Handler `explain_finding` report+fingerprint (AC-T.8–9)
- [ ] Truncación analyze_spec (AC-T.2)
- [ ] Paridad CLI vs tool (AC-T.10)
- [ ] Statelessness + INV-1 e2e MCP (AC-SRV.4–5)
- [ ] E2E S5: analyze_spec + explain con cita source
- [ ] README/índices/help docs `mcp` (AC-SRV.6, AC-T.11)
- [ ] `pnpm check` verde
- [ ] Specs f4-* → `cerrada`
- [ ] DoD plans/f4-mcp.md
- [ ] Tag `v0.4.0-mcp`
