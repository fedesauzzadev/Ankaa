export const DEFAULT_MAX_FINDINGS = 20;

export interface ToolResult {
  payload: unknown;
  isError?: boolean;
}

export interface AnalyzeSpecPayload {
  ok: boolean;
  error?: string;
  toolVersion?: string;
  packs?: Array<{ id: string; version: string }>;
  summary?: {
    error: number;
    warning: number;
    info: number;
    total: number;
    suppressed?: number;
    skillsSuppressed?: number;
  };
  reportHash?: string;
  findings?: Array<Record<string, unknown>>;
  totalFindings?: number;
  truncated?: boolean;
  gate?: { failOn: string; failed: boolean };
  note?: string;
}

export function truncateAnalyzePayload(
  payload: AnalyzeSpecPayload,
  maxFindings: number = DEFAULT_MAX_FINDINGS,
): AnalyzeSpecPayload {
  if (payload.ok !== true || !Array.isArray(payload.findings)) {
    return payload;
  }
  const total = payload.totalFindings ?? payload.findings.length;
  if (payload.findings.length <= maxFindings && payload.truncated !== true) {
    return {
      ...payload,
      totalFindings: total,
    };
  }
  return {
    ...payload,
    findings: payload.findings.slice(0, maxFindings),
    totalFindings: total,
    truncated: true,
    note: "truncated: use CLI for full report",
  };
}

export interface McpToolHandlers {
  analyzeSpec(input: {
    path: string;
    failOn?: string;
    rules?: string[];
  }): Promise<ToolResult>;
  listRules(input: { rules?: string[] }): Promise<ToolResult>;
  explainRule(input: {
    ruleId: string;
    rules?: string[];
  }): Promise<ToolResult>;
  validateCustomRules(input: { files: string[] }): Promise<ToolResult>;
  explainFinding(input: {
    reportPath: string;
    fingerprint: string;
  }): Promise<ToolResult>;
}
