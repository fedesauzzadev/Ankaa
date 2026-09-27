import type { RulePack } from "@apigovscan/core";
import type { Report } from "@apigovscan/reporters";

export interface SpecLoader {
  load(path: string): Promise<Uint8Array>;
}

export interface PackRepository {
  loadActive(): Promise<RulePack[]>;
  loadProtocol(id: string): Promise<RulePack>;
}

export interface ReportSink {
  write(report: Report): Promise<void>;
}
