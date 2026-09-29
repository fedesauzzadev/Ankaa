# f4-mcp-server · Server MCP stdio local

| Campo     | Valor                                                                                       |
| --------- | ------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                     |
| Fase      | 4                                                                                           |
| Deriva de | SDD FR-50/FR-51, ADR-009, D9; doc 02 §MCP stdio, doc 05 §6, doc 06 §7; specs `f4-mcp-tools` |
| Roadmap   | Fase 4 — MCP stdio local                                                                    |

## 1. Objetivo

Como **dev que usa un agente LLM**, quiero exponer ApiGovScan como servidor MCP por **stdio** sobre mi filesystem local, para que Claude/Cursor/opencode analicen mis specs sin subir nada (S5: 0 tokens de ApiGovScan).

**User story canónica:**

> Given `mcpServers.apigovscan` apuntando a `apigovscan mcp`,  
> When el cliente manda `initialize` y `tools/call analyze_spec`,  
> Then recibe el mismo reporte que el CLI sobre un path local — **cero** red, sin estado entre sesiones.

## 2. Alcance

### Dentro

- `createMcpServer(handlers)` + transporte **stdio** en `@apigovscan/mcp`.
- Subcomando CLI `apigovscan mcp` (y `npx @apigovscan/cli mcp`).
- Inyección de handlers desde CLI (cli → mcp; sin ciclo; SDK solo en adapter).
- **Path sandbox:** todo path de tool se resuelve contra `cwd` del proceso; si queda **fuera de cwd** → error del tool (no escape flag en v1).
- **Truncación de output:** findings top-N (default 20) + `truncated` + nota `use CLI for full report`.
- Stateless: sin caché entre calls ni entre sesiones; cada call es función pura de sus inputs.
- INV-1: `analyze_spec` no realiza red (core/CLI ya lo garantizan).
- Docs: README + registro ejemplo Claude/Cursor/opencode (doc 05 §6).

### Fuera (explícito)

- MCP remoto Cloudflare (`list_packs`/`get_pack`/`explain_rule` público) → fase 6 (FR-52).
- Tools de escritura (`learn`, `init`, baseline write) — lectura/validación/analyze solamente en v1.
- Transport HTTP/SSE.
- Autenticación / multi-tenant.
- Estado persistente del server (sessions con memoria).

## 3. Contrato

### Comando CLI

```bash
apigovscan mcp [--cwd <dir>]
```

| Condición                  | Exit                              |
| -------------------------- | --------------------------------- |
| Server corriendo por stdio | 0 al cierre limpio del transporte |
| Error fatal de arranque    | 2                                 |
| `--help`                   | 0 (describe el server + tools)    |

### `@apigovscan/mcp` API

```ts
export interface McpToolHandlers {
  analyzeSpec(input: { path: string; failOn?: string; rules?: string[] }): Promise<ToolResult>;
  listRules(input: { rules?: string[] }): Promise<ToolResult>;
  explainRule(input: { ruleId: string; rules?: string[] }): Promise<ToolResult>;
  validateCustomRules(input: { files: string[] }): Promise<ToolResult>;
  explainFinding(input: { reportPath: string; fingerprint: string }): Promise<ToolResult>;
}

export interface ToolResult {
  /** JSON serializable payload returned as MCP text content */
  payload: unknown;
  /** When true, server marks isError content for the client */
  isError?: boolean;
}

export function createMcpServer(handlers: McpToolHandlers): McpServer;
export async function startStdioServer(server: McpServer): Promise<void>;
```

### Tools (registro)

| Tool                    | Input (zod/JSON schema)                                                           | Output payload                                                   |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `analyze_spec`          | `{ path: string, failOn?: "never"\|"error"\|"warning"\|"any", rules?: string[] }` | `{ ok, report?, truncated?, totalFindings?, findings?, error? }` |
| `list_rules`            | `{ rules?: string[] }`                                                            | `{ rules: [{ id, severity, category, message, enabled }] }`      |
| `explain_rule`          | `{ ruleId: string, rules?: string[] }`                                            | `{ ok, explanation?, error? }` (mensaje + fix + source pack)     |
| `validate_custom_rules` | `{ files: string[] }`                                                             | `{ ok, files: ValidateFileOutcome[] }`                           |
| `explain_finding`       | `{ reportPath: string, fingerprint: string }`                                     | `{ ok, finding?, explanation?, error? }`                         |

- Nombres **canónicos = FR-50** (SDD usa alias cortos `analyze`/`validate_rules` — se documenta alias solo si hace falta en help; schema usa FR-50).
- `rules` en tools = paths de archivos custom (relativos a cwd), igual que `--rules` CLI.
- Tool results MCP: `content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]`; `isError: true` cuando `payload.ok === false` o fallo de sandbox.

### Path sandbox

```
resolve(cwd, path) → must be inside cwd (inclusive)
```

- `..`, absolutos fuera de cwd, y symlinks que escapen → rechazados.
- Mensaje (EN): `path escapes cwd sandbox: <input>`.
- Sin flag de escape en v1.

### Truncación

- Default `maxFindings = 20` en `analyze_spec` (constante exportada `DEFAULT_MAX_FINDINGS`).
- Si total > N: `truncated: true`, `findings` solo primeros N **ya ordenados** (mismo orden determinista del report), `totalFindings` = total, `note: "truncated: use CLI for full report"`.
- `explain_finding` opera sobre el **report completo** en disco (`reportPath`), no sobre la versión truncada.

## 4. Criterios de aceptación

- [x] **AC-SRV.1** `createMcpServer` + `initialize` + `tools/list` → 5 tools con schemas.
- [x] **AC-SRV.2** `apigovscan mcp --help` sale 0 y documenta tools + ejemplo de registro.
- [x] **AC-SRV.3** Path fuera de cwd en cualquier tool con path → `isError`, payload con `path escapes cwd sandbox`.
- [x] **AC-SRV.4** Dos calls independientes al mismo server sin estado compartido (mismo output).
- [x] **AC-SRV.5** INV-1: durante `analyze_spec` global fetch stub falla y el call sigue ok.
- [x] **AC-SRV.6** README/docs mencionan `apigovscan mcp` + snippet `mcpServers`.

## 5. Test plan

| Caso                              | Tipo                                                             |
| --------------------------------- | ---------------------------------------------------------------- |
| initialize + tools/list (5 tools) | unit/e2e in-process (SDK client sobre streams o handler directo) |
| path sandbox `../` y absolute     | unit (resolve helper) + tool call                                |
| statelessness call×2              | e2e                                                              |
| INV-1 analyze_spec                | e2e con fetch stub                                               |
| help `mcp`                        | e2e CLI in-process (`RunIO`)                                     |

## 6. Dependencias

- Spec `f4-mcp-tools` (contratos de tools).
- `@modelcontextprotocol/sdk` (dep de `@apigovscan/mcp`; **nunca** en `@apigovscan/core`).
- CLI existente: `analyzeUseCase`, `validateRulesFiles`, pack loaders, core `explain`.

## 7. Riesgos y decisiones abiertas

| Tema                 | Decisión                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDK en core?         | **No** — banned por INV; solo en `packages/mcp` (+ wiring cli).                                                                                                                                                                                                                                                          |
| Embebido vs paquete  | Server library en `packages/mcp`; CLI solo spawn/inject — doc 02 "embebido" = bin + server juntos en UX, no mono-archivo.                                                                                                                                                                                                |
| Alias de nombres SDD | Canónicos FR-50; help menciona ambos si aporta.                                                                                                                                                                                                                                                                          |
| Streams test         | Preferir `McpServer` + in-memory transport del SDK si existe; si no, spawn proceso.                                                                                                                                                                                                                                      |
| Symlinks             | v1: `realpath` **solo como chequeo de containment** (best-effort); se **devuelve la path léxica** para que los labels/`reportHash` del MCP coincidan con el CLI (paridad AC-T.10; en macOS `/var/folders` → `/private/…` rompía la paridad). Si `realpath` falla, se acepta tras el chequeo léxico (no cambia mensajes). |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 4 + ADR-009 + FR-50/51 + doc 06 §7.
- 2026-09-24 · M4.1+M4.2: server SDK 1.30, 5 tools, sandbox, truncación, cmd `mcp`, tests → `cerrada`.
- 2026-09-25 · Fix post-cierre (bug macOS en CI): el sandbox devuelve la path léxica tras validar con `realpath` — antes devolvía la realpath y el `report.input[].path` del MCP divergía del CLI en runners con symlink de temp (`/var` → `/private/var`), rompiendo AC-T.10. Tests de symlink agregados en `packages/mcp/test/smoke.test.ts`.
