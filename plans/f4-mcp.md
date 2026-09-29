# Plan · f4-mcp · MCP stdio local

| Campo             | Valor                                  |
| ----------------- | -------------------------------------- |
| Specs             | f4-mcp-server, f4-mcp-tools            |
| Esfuerzo estimado | 1 semana (1 dev full-time equivalente) |
| Dependencias      | f3 cerrado (`v0.3.0-learning`)         |
| Milestones        | M4.1–M4.2                              |

## Estrategia

**Primero levantar el server y los tools de consulta/analyze core** (valor inmediato S5), **después validate + explain_finding + hardening + e2e/cierre**. SDK solo en `packages/mcp`; CLI inyecta handlers (sin ciclo de deps; core intacto INV).

```
M4.1 SDK + createMcpServer + analyze_spec + list_rules + explain_rule + cmd mcp
M4.2 validate_custom_rules + explain_finding + sandbox/truncation + e2e S5 + docs + cierre
```

## M4.1 — Server + tools core (f4-mcp-server + tools parcial)

**Alcance:** transporte stdio, registro de tools, path sandbox base, 3 tools, subcomando CLI.

Pasos:

1. Agregar `@modelcontextprotocol/sdk` a `packages/mcp` (no a core).
2. `packages/mcp/src/index.ts` (o `server.ts`): `McpToolHandlers`, `ToolResult`, `createMcpServer`, schemas zod/JSON de los tools, `startStdioServer`, `DEFAULT_MAX_FINDINGS`, `resolveSandboxPath(cwd, input)`.
3. `packages/cli`: exportar/reutilizar `analyzeUseCase` + loaders + pack-fs + `explain`; implementar `createCliMcpHandlers(io)` con `analyze_spec`, `list_rules`, `explain_rule`.
4. Dispatcher `mcp` en `run()` + `getHelp()` + `runMcpCommand`.
5. Tests: tools/list (5), sandbox, analyze/list/explain happy + error, help mcp.
6. Spec `f4-mcp-server` → `implementada` (AC-SRV.1–3 al menos); `f4-mcp-tools` → `implementada` cuando M4.2 cierre AC-T.

**DoD:** AC-SRV.1–3 verdes; AC-T.1–6 verdes; `pnpm check` verde; commit.

## M4.2 — Tools restantes + cierre (f4-mcp-tools + hardening)

**Alcance:** `validate_custom_rules`, `explain_finding`, truncación, INV-1 e2e, docs, tag.

Pasos:

1. Handlers `validate_custom_rules` (validateRulesFiles) y `explain_finding` (load report + fingerprint + explain).
2. Truncación `analyze_spec` + tests AC-T.2.
3. E2E S5: init fixture → analyze_spec → explain_rule NAMING-004 (o rule del fixture) con cita source.
4. Paridad CLI vs tool (AC-T.10); INV-1 stub fetch; statelessness AC-SRV.4–5.
5. README + docs/05 snippet; índices specs/plans/tasks; `pnpm check`; specs → `cerrada`; tag `v0.4.0-mcp`.

**DoD:** todos AC de f4-mcp-*; criterio salida SDD fase 4 (cliente MCP analiza spec local e2e — demostrado con SDK client en tests); INV-1; tag.

## Orden de merge recomendado

1. `feat/mcp-server` (M4.1)
2. `feat/mcp-tools-close` (M4.2)

## Riesgos del plan

| Riesgo                             | Impacto      | Mitigación                                 |
| ---------------------------------- | ------------ | ------------------------------------------ |
| SDK API cambia / peer deps         | Build roto   | Pin versión; smoke test initialize         |
| Ciclo cli↔mcp                      | Arquitectura | Solo cli → mcp; handlers inyectados        |
| Core contaminado con SDK           | INV roto     | Gate tests ya existen; review package.json |
| Output gigante en contexto LLM     | UX/seguridad | Truncación top-N + nota CLI                |
| Path escape                        | Seguridad    | Sandbox + tests `..` y absolute            |
| Paridad CLI vs handlers divergente | FR-51        | Reusar analyzeUseCase, no reimplementar    |
| Nombres SDD vs FR-50               | Confusión    | Canónicos FR-50 en schemas                 |

## Definition of Done (fase 4 completa)

- [x] Specs `f4-mcp-server` y `f4-mcp-tools` en estado `cerrada`
- [x] `pnpm check` verde
- [x] INV-1 verificado en test de `analyze_spec` vía MCP
- [x] Criterio SDD: cliente MCP (SDK en tests / docs para Claude/Cursor) analiza spec local end-to-end
- [x] README: `apigovscan mcp` + snippet registro
- [x] Tag `v0.4.0-mcp`
- [x] tasks/f4 cerrados

## Changelog del plan

- 2026-09-24 · Plan inicial desde specs f4 (tras tag v0.3.0-learning).
- 2026-09-24 · M4.1–M4.2 implementados; `pnpm check` verde; tag `v0.4.0-mcp` creado; fase 4 cerrada.
