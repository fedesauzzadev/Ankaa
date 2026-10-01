import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import {
  EXAMPLES_PACK_ID,
  attachPositions,
  packageVersion,
  sortFindings,
  validateExamples,
  type Finding,
} from "@ankaa/core";
import { buildReport } from "@ankaa/reporters";
import { computeExitCode, describeSuppression, parseSpecInput } from "./analyze.js";
import { prepareAnalysis } from "./analyze-setup.js";
import { loadConfig } from "./config.js";
import { checkLicense, licenseErrorMessage } from "./license.js";
import { createReportSink } from "./loaders.js";
import { applySkillSuppressions } from "./skills.js";
import type { FailOn } from "./args.js";

const USAGE = [
  "usage: ankaa validate-examples <path> [--format console|json] [--output <file>] [--fail-on <sev>]",
  "               [--skills-dir <dir>] [--config <file>] [--license-key <key>] [--no-color]",
  "",
  "Offline validation of schema-level examples against the documented subset",
  "(see specs/f13-mini-validator.md). EXVAL-001 warning on mismatch,",
  "EXVAL-002 info when an example cannot be validated (remote $ref, cycle,",
  "size/depth budget).",
  "",
].join("\n");

interface ExamplesIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Record<string, string | undefined>;
  cwd: string;
  isTTY: boolean;
}

function normalizeLabel(absPath: string, cwd: string): string {
  const rel = relative(cwd, absPath);
  return rel.split(sep).join("/");
}

export async function runValidateExamplesCommand(
  argv: readonly string[],
  io: ExamplesIo,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }

  let path = "";
  let pathSeen = false;
  let format: "console" | "json" = "console";
  let output: string | undefined;
  let failOn: FailOn = "error";
  let skillsDir: string | undefined;
  let configPath: string | undefined;
  let licenseKey: string | undefined;
  let noColor = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--format" || token === "--output" || token === "--skills-dir" || token === "--config" || token === "--license-key" || token === "--fail-on") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("-")) {
        io.stderr(`error: ${token} requires a value\n`);
        return 2;
      }
      if (token === "--format") {
        if (value !== "console" && value !== "json") {
          io.stderr("error: --format must be console | json\n");
          return 2;
        }
        format = value;
      } else if (token === "--output") output = value;
      else if (token === "--skills-dir") skillsDir = value;
      else if (token === "--config") configPath = value;
      else if (token === "--license-key") licenseKey = value;
      else {
        if (value !== "error" && value !== "warning" && value !== "info" && value !== "never") {
          io.stderr("error: --fail-on must be error | warning | info | never\n");
          return 2;
        }
        failOn = value;
      }
      continue;
    }
    if (token === "--no-color") {
      noColor = true;
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    if (pathSeen) {
      io.stderr(`error: unexpected argument: ${token}\n`);
      return 2;
    }
    path = token;
    pathSeen = true;
  }

  if (!pathSeen) {
    io.stderr("error: missing required argument <path>\n");
    return 2;
  }

  const configResult = loadConfig(io.cwd, configPath);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const config = configResult.config;

  const license = checkLicense({
    flag: licenseKey,
    env: io.env.ANKAA_LICENSE_KEY,
    config: config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const inputPath = resolve(io.cwd, path);
  if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
    io.stderr(`error: input not found or not a file: ${path}\n`);
    return 2;
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(inputPath));
  } catch (err) {
    io.stderr(
      `error: cannot read ${path}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const label = normalizeLabel(inputPath, io.cwd);
  const parsed = parseSpecInput(path, bytes, label);
  if (!parsed.ok) {
    io.stderr(`error: ${parsed.error}\n`);
    return 2;
  }

  const prepared = prepareAnalysis(io.cwd, config, {
    rulesFiles: [],
    skillsDir,
    baselineMode: "off",
  });
  if (!prepared.ok) {
    io.stderr(`error: ${prepared.error}\n`);
    return 2;
  }
  const setup = prepared.setup;

  const started = performance.now();
  const { findings: raw, summary: counts } = validateExamples(parsed.spec, {
    packVersion: packageVersion(),
  });
  const positioned = attachPositions(raw, parsed.spec);

  let findings: Finding[] = positioned.filter((f) => !setup.disabledRuleIds.has(f.ruleId));
  if (setup.severityOverrides.size > 0) {
    findings = findings.map((f) =>
      setup.severityOverrides.has(f.ruleId)
        ? { ...f, severity: setup.severityOverrides.get(f.ruleId)! }
        : f,
    );
    findings = sortFindings(findings);
  }

  let skillsSuppressedCount = 0;
  const skillsWarnings: string[] = [];
  if (setup.skillsSuppressions !== undefined && setup.skillsSuppressions.suppressions.length > 0) {
    const { suppressions, matchRegexes } = setup.skillsSuppressions;
    const applied = applySkillSuppressions(findings, suppressions, matchRegexes);
    skillsSuppressedCount = applied.suppressed;
    findings = applied.visible;
    const matched = new Set(applied.matchedIndexes);
    for (const index of applied.expiredIndexes) {
      skillsWarnings.push(
        `suppression expired (ignored): ${describeSuppression(suppressions[index]!)}`,
      );
    }
    for (let i = 0; i < suppressions.length; i++) {
      if (!matched.has(i) && !applied.expiredIndexes.includes(i)) {
        skillsWarnings.push(`suppression matches no findings: ${describeSuppression(suppressions[i]!)}`);
      }
    }
  }
  for (const warning of skillsWarnings) {
    io.stderr(`warning: ${warning}\n`);
  }

  const report = buildReport({
    results: [{ findings, errors: [] }],
    inputs: [{ path: label, sha256: `sha256:${parsed.spec.inputHash}` }],
    packs: [{ id: EXAMPLES_PACK_ID, version: packageVersion() }],
    toolVersion: packageVersion(),
    meta: { durationMs: Math.round(performance.now() - started) },
    ...(skillsSuppressedCount > 0 ? { skillsSuppressed: skillsSuppressedCount } : {}),
  });

  if (format === "console") {
    io.stdout(
      `examples: ${counts.checked} checked · ${counts.valid} valid · ${counts.partial} partial · ${counts.invalid} invalid · ${counts.skipped} skipped\n`,
    );
  }

  const color = !noColor && !(io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== "") && io.isTTY;
  const pretty = format === "json" && io.isTTY && output === undefined;
  try {
    await createReportSink({
      format,
      color,
      pretty,
      output: output !== undefined ? resolve(io.cwd, output) : undefined,
      stdout: io.stdout,
    }).write(report);
  } catch (err) {
    io.stderr(
      `error: cannot write report: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  return computeExitCode(report, failOn);
}
