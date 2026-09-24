import { readFile, writeFile } from "node:fs/promises";
import type { Report } from "@apigovscan/reporters";
import {
  formatAnnotations,
  formatConsole,
  formatJson,
  formatMarkdown,
  formatSarif,
} from "@apigovscan/reporters";
import type { PackRepository, ReportSink, SpecLoader } from "./ports.js";
import { defaultPackSearchRoots, findElitePackDir, loadPackFromDir } from "./pack-fs.js";
import type { OutputFormat } from "./args.js";

export function createFsSpecLoader(stdinBytes?: () => Promise<Uint8Array>): SpecLoader {
  return {
    async load(path: string): Promise<Uint8Array> {
      if (path === "-") {
        if (!stdinBytes) {
          throw new Error("stdin is not available");
        }
        return stdinBytes();
      }
      const buf = await readFile(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
  };
}

export function createFsPackRepository(cwd: string): PackRepository {
  return {
    async loadActive() {
      const dir = findElitePackDir(defaultPackSearchRoots(cwd));
      if (!dir) {
        throw new Error(
          "elite pack not found (searched for packs/elite/pack.yaml from cwd and CLI install)",
        );
      }
      return [loadPackFromDir(dir)];
    },
  };
}

export interface SinkOptions {
  format: OutputFormat;
  color: boolean;
  pretty: boolean;
  output?: string;
  stdout: (text: string) => void;
}

function shortSummary(report: Report): string {
  const { error, warning, info } = report.summary;
  const hash = report.reportHash.slice(0, 8);
  return `${error} errors · ${warning} warnings · ${info} info · reportHash ${hash}\n`;
}

function renderReport(report: Report, opts: SinkOptions, toFile: boolean): string {
  switch (opts.format) {
    case "json":
      return formatJson(report, { pretty: !toFile && opts.pretty });
    case "sarif":
      return formatSarif(report);
    case "markdown":
      return formatMarkdown(report);
    case "annotations":
      return formatAnnotations(report);
    case "console":
      return formatConsole(report, { color: !toFile && opts.color });
  }
}

export function createReportSink(opts: SinkOptions): ReportSink {
  return {
    async write(report: Report): Promise<void> {
      if (opts.output !== undefined) {
        await writeFile(opts.output, renderReport(report, opts, true), "utf8");
        if (opts.format === "console") {
          opts.stdout(shortSummary(report));
        }
        return;
      }

      opts.stdout(renderReport(report, opts, false));
    },
  };
}
