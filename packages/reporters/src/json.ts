import type { Report } from "./build.js";

export function formatJson(report: Report, opts?: { pretty?: boolean }): string {
  const pretty = opts?.pretty === true;
  return `${JSON.stringify(report, null, pretty ? 2 : 0)}\n`;
}
