import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SandboxError, resolveSandboxPath } from "./sandbox.js";
import {
  DEFAULT_MAX_FINDINGS,
  truncateAnalyzePayload,
  truncateReviewPayload,
  type AnalyzeSpecPayload,
  type McpToolHandlers,
  type ReviewApiChangePayload,
  type ToolResult,
} from "./tools.js";

export interface CreateMcpServerOptions {
  cwd: string;
  name?: string;
  version?: string;
  maxFindings?: number;
}

function textResult(
  result: ToolResult,
  truncated?: AnalyzeSpecPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  const payload = truncated ?? result.payload;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    ...(result.isError === true ? { isError: true } : {}),
  };
}

function errorResult(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message = error instanceof Error ? error.message : `unexpected error: ${String(error)}`;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: false, error: message }, null, 2),
      },
    ],
    isError: true,
  };
}

function sandboxRules(cwd: string, rules?: string[]): string[] | undefined {
  if (rules === undefined) return undefined;
  return rules.map((r) => resolveSandboxPath(cwd, r));
}

export function createMcpServer(
  handlers: McpToolHandlers,
  options: CreateMcpServerOptions,
): McpServer {
  const { cwd, maxFindings = DEFAULT_MAX_FINDINGS } = options;
  const server = new McpServer(
    {
      name: options.name ?? "ankaa",
      version: options.version ?? "0.0.0-dev",
    },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "analyze_spec",
    {
      title: "Analyze OpenAPI spec",
      description:
        "Run Ankaa analyze on a local OpenAPI/Swagger file or directory. Same semantics as the CLI. Output findings are truncated; use the CLI for the full report.",
      inputSchema: {
        path: z.string().describe("File or directory path relative to the server cwd (sandboxed)"),
        failOn: z
          .enum(["never", "error", "warning", "info"])
          .optional()
          .describe("Gate threshold reflected in payload.gate (default: config or error)"),
        rules: z
          .array(z.string())
          .optional()
          .describe("Optional custom rule files (sandboxed paths)"),
      },
    },
    async (args) => {
      try {
        const path = resolveSandboxPath(cwd, args.path);
        const rules = sandboxRules(cwd, args.rules);
        const result = await handlers.analyzeSpec({
          path,
          ...(args.failOn !== undefined ? { failOn: args.failOn } : {}),
          ...(rules !== undefined ? { rules } : {}),
        });
        const truncated =
          result.isError === true
            ? undefined
            : truncateAnalyzePayload(result.payload as AnalyzeSpecPayload, maxFindings);
        return textResult(result, truncated);
      } catch (err) {
        if (err instanceof SandboxError) return errorResult(err);
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_rules",
    {
      title: "List governance rules",
      description: "List active elite pack rules (and optional custom rule files).",
      inputSchema: {
        rules: z
          .array(z.string())
          .optional()
          .describe("Optional custom rule files (sandboxed paths)"),
      },
    },
    async (args) => {
      try {
        const rules = sandboxRules(cwd, args.rules);
        const result = await handlers.listRules({
          ...(rules !== undefined ? { rules } : {}),
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "explain_rule",
    {
      title: "Explain a rule",
      description: "Explain a rule by id (message, fix, source citation, pack version).",
      inputSchema: {
        ruleId: z.string().describe("Rule id, e.g. NAMING-004"),
        rules: z
          .array(z.string())
          .optional()
          .describe("Optional custom rule files (sandboxed paths)"),
      },
    },
    async (args) => {
      try {
        const rules = sandboxRules(cwd, args.rules);
        const result = await handlers.explainRule({
          ruleId: args.ruleId,
          ...(rules !== undefined ? { rules } : {}),
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "validate_custom_rules",
    {
      title: "Validate custom rules",
      description: "Validate custom rule YAML/JSON files against the Ankaa DSL.",
      inputSchema: {
        files: z.array(z.string()).min(1).describe("Rule files to validate (sandboxed paths)"),
      },
    },
    async (args) => {
      try {
        const files = args.files.map((f) => resolveSandboxPath(cwd, f));
        const result = await handlers.validateCustomRules({ files });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "explain_finding",
    {
      title: "Explain a finding",
      description:
        "Look up a finding by fingerprint in a JSON report on disk and attach the rule explanation (message, fix, source).",
      inputSchema: {
        reportPath: z
          .string()
          .describe("Path to a JSON report from analyze --format json (sandboxed)"),
        fingerprint: z
          .string()
          .describe("Full finding fingerprint or a unique prefix (8+ hex chars) from the report"),
      },
    },
    async (args) => {
      try {
        const reportPath = resolveSandboxPath(cwd, args.reportPath);
        const result = await handlers.explainFinding({
          reportPath,
          fingerprint: args.fingerprint,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "suggest_fix",
    {
      title: "Suggest a fix",
      description:
        "Propose a unified-diff fix for a finding (from a JSON report on disk) using the configured LLM. Draft only; never applies changes. Requires llm.baseUrl in ankaa.yaml.",
      inputSchema: {
        fingerprint: z
          .string()
          .describe("Full finding fingerprint or a unique prefix (8+ hex chars) from the report"),
        reportPath: z
          .string()
          .optional()
          .describe(
            "Path to a JSON report from analyze --format json (sandboxed). Required: save one with the CLI first.",
          ),
      },
    },
    async (args) => {
      try {
        if (args.reportPath === undefined) {
          return textResult({
            payload: {
              ok: false,
              error:
                "suggest_fix requires reportPath: save a report with analyze --format json --output first",
            },
            isError: true,
          });
        }
        const reportPath = resolveSandboxPath(cwd, args.reportPath);
        const result = await handlers.suggestFix({
          reportPath,
          fingerprint: args.fingerprint,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "review_api_change",
    {
      title: "Review an API change",
      description:
        "Run the same review as `ankaa review <base> <candidate>`: candidate governance findings plus base-candidate compatibility findings, with a stable reportHash. Deterministic, no LLM, no network. Feedback only: you decide what to edit; CI is the final gate. Re-runs the current state on every call; output findings are truncated (see totalFindings/truncated) — use the CLI for the full review.",
      inputSchema: {
        baselinePath: z
          .string()
          .describe("Baseline contract path relative to the server cwd (sandboxed)"),
        candidatePath: z
          .string()
          .describe("Candidate contract path relative to the server cwd (sandboxed)"),
        failOn: z
          .enum(["never", "error", "warning", "info"])
          .optional()
          .describe("Gate threshold reflected in payload.gate (default: config or error)"),
      },
    },
    async (args) => {
      try {
        const baselinePath = resolveSandboxPath(cwd, args.baselinePath);
        const candidatePath = resolveSandboxPath(cwd, args.candidatePath);
        const result = await handlers.reviewApiChange({
          baselinePath,
          candidatePath,
          ...(args.failOn !== undefined ? { failOn: args.failOn } : {}),
        });
        const truncated =
          result.isError === true
            ? undefined
            : truncateReviewPayload(result.payload as ReviewApiChangePayload, maxFindings);
        return textResult(result, truncated);
      } catch (err) {
        if (err instanceof SandboxError) return errorResult(err);
        return errorResult(err);
      }
    },
  );

  return server;
}

export async function startStdioServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
