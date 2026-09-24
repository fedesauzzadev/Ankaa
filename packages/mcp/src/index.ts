export const MCP_PACKAGE = "@apigovscan/mcp";

export function mcpPackageId(): string {
  return MCP_PACKAGE;
}

export { SandboxError, resolveSandboxPath } from "./sandbox.js";
export {
  DEFAULT_MAX_FINDINGS,
  truncateAnalyzePayload,
  type AnalyzeSpecPayload,
  type McpToolHandlers,
  type ToolResult,
} from "./tools.js";
export {
  createMcpServer,
  startStdioServer,
  type CreateMcpServerOptions,
} from "./server.js";
