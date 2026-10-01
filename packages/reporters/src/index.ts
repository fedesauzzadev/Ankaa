export const REPORTERS_PACKAGE = "@ankaa/reporters";

export function reportersPackageId(): string {
  return REPORTERS_PACKAGE;
}

export {
  buildReport,
  computeReportHash,
  computeScore,
  type BuildReportInput,
  type Report,
  type ReportInput,
  type ReportMeta,
  type ReportPack,
  type ReportScore,
  type ReportSummary,
  type ReportTool,
} from "./build.js";

export { canonicalJson } from "./canonical.js";
export { redactText } from "./redact.js";
export { formatConsole, type ConsoleOpts } from "./console.js";
export { formatJson } from "./json.js";
export { formatSarif } from "./sarif.js";
export { formatMarkdown } from "./markdown.js";
export { formatAnnotations } from "./annotations.js";
export { formatJunit } from "./junit.js";
export { formatCheckstyle } from "./checkstyle.js";
export { formatCodequality } from "./codequality.js";
export { escapeXml } from "./xml.js";
export { artifactUri, locationParts } from "./uri.js";
