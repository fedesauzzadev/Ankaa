export type OperationState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type AnalyzeProgressPhase =
  | "loading-packs"
  | "loading-input"
  | "parsing"
  | "evaluating"
  | "building-report"
  | "writing-report";

export type OperationEvent =
  | { type: "state"; operation: "analyze"; state: OperationState }
  | {
      type: "progress";
      operation: "analyze";
      phase: AnalyzeProgressPhase;
      completed: number;
      total: number;
      item?: string;
    };

export interface OperationContext {
  signal?: AbortSignal;
  onEvent?: (event: OperationEvent) => void;
}

export interface OperationDescriptor {
  id: string;
  title: string;
  description: string;
  inputs: readonly string[];
  output: string;
  errors: readonly string[];
  writes: readonly string[];
  network: boolean;
}

export const ANALYZE_OPERATION = {
  id: "analyze",
  title: "Analyze API specifications",
  description: "Run local API governance rules against one specification or a directory.",
  inputs: ["A local specification file, directory, or CLI stdin (`-`)."],
  output: "A deterministic report and exit code based on the configured fail-on threshold.",
  errors: [
    "Invalid arguments or configuration.",
    "Unreadable or invalid specifications.",
    "Rule or report errors.",
    "Cancellation.",
  ],
  writes: [
    "No files by default.",
    "Only the explicitly selected report output or baseline destination when those options are used.",
  ],
  network: false,
} as const satisfies OperationDescriptor;
