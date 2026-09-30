import type { RulePack } from "@ankaa/core";
import type { Report } from "@ankaa/reporters";

export interface SpecLoader {
  load(path: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface PackRepository {
  loadActive(): Promise<RulePack[]>;
  loadProtocol(id: string): Promise<RulePack>;
}

export interface ReportSink {
  write(report: Report, signal?: AbortSignal): Promise<void>;
}
