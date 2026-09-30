import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  DIFF_PACK_ID,
  diffSpecs,
  explain,
  packageVersion,
  sortFindings,
  type Rule,
} from "@apigovscan/core";
import { buildReport } from "@apigovscan/reporters";
import {
  parseAnalyzeArgs,
  parseDashboardArgs,
  parseSuppressArgs,
  parseDiffArgs,
  parseDriftArgs,
  parseFixArgs,
  parseRulesArgs,
  parseScanOrgArgs,
  type FailOn,
} from "./args.js";
import { analyzeUseCase, computeExitCode, describeSuppression, parseSpecInput } from "./analyze.js";
import { prepareAnalysis } from "./analyze-setup.js";
import {
  buildFixMessages,
  extractSpecFragment,
  parseFixResponse,
  resolveFingerprint,
  splitFindingTarget,
} from "./fix.js";
import { chatCompletion, loadLlmConfig } from "./llm.js";
import {
  buildImportMessages,
  chunkGuideline,
  extractText,
  parseRulesEnvelope,
  serializeRulesDrafts,
  validateDrafts,
} from "./rules-import.js";
import {
  buildBaseline,
  checkInputHashes,
  resolveBaselinePath,
  writeBaselineFile,
} from "./baseline.js";
import { loadConfig, type AnalyzeConfig } from "./config.js";
import { discoverSpecs } from "./discovery.js";
import {
  buildShapeMessages,
  buildSpecSkeleton,
  buildSweepMessages,
  collectSourceFiles,
  compareEndpoints,
  MAX_FRAGMENT_CHARS,
  MAX_SHAPE_PAIRS,
  parseShapeResponse,
  parseSweepResponse,
} from "./drift.js";
import { parseSpec } from "@apigovscan/openapi";
import { aggregateScans, loadGroupMapping, type RepoScan, type SkippedRepo } from "./scan.js";
import {
  compareReports,
  dashboardHelp,
  loadOwnerMapping,
  loadReportFile as loadDashboardReportFile,
  loadTrackingFile,
  resolveDashboardPaths,
  startDashboardServer,
  type DashboardPayload,
} from "./dashboard.js";
import { renderDashboardPage } from "./dashboard-page.js";
import { cloneRepo, listOrgRepos } from "./github.js";
import { formatInitEntries, runInit } from "./init.js";
import {
  collectCustomRules,
  packRuleIds,
  validateRulesFiles,
  type RulesSource,
} from "./custom-rules.js";
import { applySkillSuppressions, listSkills, promoteDraft } from "./skills.js";
import {
  buildLearnPatch,
  loadExistingSeverities,
  loadExistingSuppressions,
  loadFeedbackFile,
  loadReportFile,
  resolveLearnSkillsDir,
  writeLearnPatch,
} from "./learn.js";
import { createFsPackRepository, createFsSpecLoader, createReportSink } from "./loaders.js";
import { createCliMcpHandlers } from "./mcp.js";
import { createMcpServer, startStdioServer } from "@apigovscan/mcp";
import { checkLicense, licenseErrorMessage } from "./license.js";
import {
  defaultPackSearchRoots,
  findElitePackDir,
  findPackDir,
  loadPackFromDir,
} from "./pack-fs.js";

export function getVersion(): string {
  return packageVersion();
}

export function getHelp(): string {
  return [
    "apigovscan — local-first API governance analyzer",
    "",
    "Usage:",
    "  apigovscan init [dir] [--force] [--skills-dir <dir>]",
    "  apigovscan analyze <path> [options]",
    "  apigovscan rules validate <file...> [options]",
    "  apigovscan rules list [--rules <file>]",
    "  apigovscan rules explain <ruleId> [--rules <file>]",
    "  apigovscan rules import --from <file> [--out <file>]",
    "  apigovscan learn --report <r.json> --feedback <f.json> [options]",
    "  apigovscan suppress --report <r.json> --fingerprint <fp> --decision <d> [--reason ...]",
    "  apigovscan skills list [--format json]",
    "  apigovscan skills promote <draftId>",
    "  apigovscan license [--key <AGS-...>]",
    "  apigovscan fix <path> [--fingerprint <fp>]",
  "  apigovscan drift <dir> [--spec <file>]",
  "  apigovscan diff <old> <new> [--format <fmt>] [--output <file>]",
  "  apigovscan scan-org <dir> [--github <org>]",
    "  apigovscan dashboard <report.json> [--port <n>]",
    "  apigovscan mcp [--help]",
    "  apigovscan --version",
    "  apigovscan --help",
    "",
    "Arguments:",
    "  path              File, directory, or '-' (stdin)",
    "  dir               init target directory (default: .)",
    "",
    "Options:",
    "  --format <fmt>    report format (default: console):",
    "                    console     human-readable report",
    "                    json        canonical JSON with reportHash",
    "                    sarif       SARIF 2.1.0 (code scanning)",
    "                    markdown    Markdown summary (job summaries)",
    "                    annotations GitHub workflow commands (::error ...)",
    "  --output <file>   write report to file",
    "  --fail-on <sev>   error | warning | info | never   (default: error)",
    "  --rules <file>    YAML/JSON custom rules (repeatable; added to pack)",
    "  --rule <json>     inline rule as JSON",
    "  --config <file>   config file (default: ./apigovscan.yaml)",
    "  --write-baseline  write baseline.json from current findings",
    "  --baseline        filter findings present in baseline",
    "  --baseline-path   baseline file (default: .apigovscan/baseline.json)",
    "  --strict-hash     baseline inputHash mismatch is fatal (exit 2)",
    "  --baseline-ignore-hash  silence inputHash mismatch warnings",
    "  --skills-dir      override skills directory (default: .apigovscan/skills)",
    "  --license-key     license key (also APIGOVSCAN_LICENSE_KEY or config license.key)",
    "  --fingerprint     fix: limit proposals to one finding (full fingerprint or unique prefix)",
    "  --report          learn: report JSON path",
    "  --feedback        learn: feedback JSON path",
    "  --dry-run         learn: print plan without writing",
    "  --force           init: overwrite scaffold; baseline: overwrite (creates .bak)",
    "  --no-color        disable color (also respects NO_COLOR)",
    "  --debug           stage timings to stderr (never spec bodies)",
    "  -h, --help",
    "  -V, --version",
    "",
    "MCP (apigovscan mcp):",
    "  stdio server with tools analyze_spec, list_rules, explain_rule,",
    "  validate_custom_rules, explain_finding, suggest_fix (sandboxed under cwd).",
    '  Client: {"mcpServers":{"apigovscan":{"command":"npx","args":["-y","@apigovscan/cli","mcp"]}}}',
    "",
    "AI features (optional):",
    "  apigovscan fix <path> [--fingerprint <fp>]",
    "  Propose unified-diff fixes for findings using your own LLM.",
    "  apigovscan rules import --from <doc> [--out <file>]",
    "  Draft custom rules from an internal guideline using your own LLM.",
    "  apigovscan drift <dir> [--spec <file>]",
    "  Detect spec-code drift and draft missing specs; LLM optional for deep scan.",
    "  Configure llm.baseUrl in apigovscan.yaml (or APIGOVSCAN_LLM_BASE_URL).",
    "  The LLM only drafts text; it never analyzes, scores, or gates.",
    "",
    "Batch audit (deterministic, no LLM):",
    "  apigovscan scan-org <dir> [--github <org>]",
    "  Consolidated per-repo scores for a directory of projects or a GitHub org.",
    "",
    "Local viewer (no analysis, no network beyond loopback):",
    "  apigovscan dashboard <report.json> [--port <n>] [--against <old.json>]",
    "  Serve finding cards with grouping and local tracking on 127.0.0.1.",
    "",
    "Exit codes:",
    "  0  no findings at or above --fail-on",
    "  1  findings at or above --fail-on",
    "  2  usage / parse / config / rule / baseline / skills / learn / init / mcp error",
    "",
    "Docs: docs/SDD.md · specs/f1-analyze.md · specs/f2-*.md · specs/f3-*.md · specs/f4-mcp-*.md · specs/f5-*.md · specs/f8-*",
  ].join("\n");
}

export interface RunIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  env?: Record<string, string | undefined>;
  cwd?: string;
  isTTY?: boolean;
  stdin?: () => Promise<Uint8Array>;
}

function normalizeLabel(absPath: string, cwd: string): string {
  const rel = relative(cwd, absPath);
  const raw = rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : absPath;
  return sep === "\\" ? raw.split(sep).join("/") : raw;
}

function mergeFailOn(
  flag: FailOn | undefined,
  config: AnalyzeConfig,
  stderr: (t: string) => void,
): FailOn {
  const failOn = flag ?? config.failOn ?? "error";
  if (failOn === "never") {
    stderr("warning: failOn=never always exits 0; use only for exploration, not CI\n");
  }
  return failOn;
}

async function runAnalyze(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
    isTTY: boolean;
    readStdin: () => Promise<Uint8Array>;
  },
): Promise<number> {
  const parsedArgs = parseAnalyzeArgs(argv);
  if (!parsedArgs.ok) {
    io.stderr(`error: ${parsedArgs.error}\n`);
    return 2;
  }
  const args = parsedArgs.args;

  const configResult = loadConfig(io.cwd, args.config);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const config = configResult.config;

  if (config.standards?.pack !== undefined && config.standards.pack !== "elite") {
    io.stderr(
      `error: unknown pack "${config.standards.pack}" (f1 ships only the embedded "elite" pack)\n`,
    );
    return 2;
  }

  const license = checkLicense({
    flag: args.licenseKey,
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const failOn = mergeFailOn(args.failOn, config, io.stderr);

  // Baseline mode: flags > config > off. write and read are mutually exclusive (args).
  const baselineMode: "write" | "read" | "off" = args.writeBaseline
    ? "write"
    : args.baseline || config.baseline?.enabled === true
      ? "read"
      : "off";

  const baselinePath = resolveBaselinePath(
    args.baselinePath,
    config.baseline?.path,
    config.configDir,
    io.cwd,
  );

  const hashMode: "warn" | "strict" | "ignore" = args.baselineIgnoreHash
    ? "ignore"
    : args.strictHash || (baselineMode === "read" && config.baseline?.strictHash === true)
      ? "strict"
      : "warn";

  if (config.standards?.version !== undefined && config.standards.version !== "0.0.0-dev") {
    const eliteDir = findElitePackDir(defaultPackSearchRoots(io.cwd));
    if (eliteDir) {
      try {
        const pack = loadPackFromDir(eliteDir);
        if (pack.version !== config.standards!.version) {
          io.stderr(
            `warning: standards.version ${config.standards!.version} does not match embedded pack ${pack.id}@${pack.version}\n`,
          );
        }
      } catch {
        // pack load failure is reported later by the use case
      }
    }
  }

  // Load skills, custom rules, severity pipeline and baseline (read mode).
  const prepared = prepareAnalysis(io.cwd, config, {
    rulesFiles: args.rulesFiles,
    ruleInline: args.ruleInline,
    skillsDir: args.skillsDir,
    baselinePath: args.baselinePath,
    baselineMode: baselineMode === "read" ? "read" : "off",
  });
  if (!prepared.ok) {
    io.stderr(`error: ${prepared.error}\n`);
    return 2;
  }
  const setup = prepared.setup;

  // Write mode: refuse overwrite before analyze when file exists without --force
  if (baselineMode === "write" && existsSync(baselinePath) && !args.force) {
    io.stderr(`error: baseline already exists: ${baselinePath} (pass --force to overwrite)\n`);
    return 2;
  }

  let inputs: string[];
  const inputPath = resolve(io.cwd, args.path);
  if (args.path === "-") {
    inputs = ["-"];
  } else if (!existsSync(inputPath)) {
    io.stderr(`error: input not found: ${args.path}\n`);
    return 2;
  } else if (statSync(inputPath).isDirectory()) {
    const discovered = discoverSpecs(inputPath);
    if (!discovered.ok) {
      io.stderr(`error: ${discovered.error}\n`);
      return 2;
    }
    inputs = discovered.paths.map((p) => resolve(inputPath, p));
  } else {
    inputs = [inputPath];
  }

  const noColor = args.noColor || (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== "");
  const color = !noColor && io.isTTY;
  const pretty = args.format === "json" && io.isTTY && args.output === undefined;

  const debug = args.debug
    ? (line: string) => {
        io.stderr(`debug: ${line}\n`);
      }
    : undefined;

  const outcome = await analyzeUseCase(
    {
      loader: createFsSpecLoader(io.readStdin),
      packs: createFsPackRepository(io.cwd),
      sink: createReportSink({
        format: args.format,
        color,
        pretty,
        output: args.output !== undefined ? resolve(io.cwd, args.output) : undefined,
        stdout: io.stdout,
      }),
    },
    {
      inputs,
      labelFor: (p) => (p === "-" ? "<stdin>" : normalizeLabel(p, io.cwd)),
      failOn,
      customRules: setup.customRules,
      disabledRuleIds: setup.disabledRuleIds,
      severityOverrides: setup.severityOverrides,
      toolVersion: packageVersion(),
      debug,
      baselineFingerprints: setup.baselineFingerprints,
      skillsSuppressions: setup.skillsSuppressions,
    },
  );

  if (!outcome.ok) {
    io.stderr(`error: ${outcome.error}\n`);
    return outcome.exitCode;
  }

  for (const w of outcome.skillsWarnings) {
    io.stderr(`warning: ${w}\n`);
  }

  // Hash checks after we know report.input labels/sha256
  if (baselineMode === "read" && setup.loadedBaseline !== undefined) {
    const complaints = checkInputHashes(setup.loadedBaseline, outcome.report.input, hashMode);
    if (complaints.fatal !== undefined) {
      io.stderr(`error: ${complaints.fatal}\n`);
      return 2;
    }
    for (const w of complaints.warnings) {
      io.stderr(`warning: ${w}\n`);
    }
  }

  // Write baseline from unfiltered findings (report already emitted)
  if (baselineMode === "write") {
    const baseline = buildBaseline({
      findings: outcome.allFindings,
      inputs: outcome.report.input,
      packs: outcome.report.packs,
      toolVersion: packageVersion(),
      engineVersion: packageVersion(),
    });
    const written = writeBaselineFile(baselinePath, baseline, args.force);
    if (!written.ok) {
      io.stderr(`error: ${written.error}\n`);
      return 2;
    }
    io.stderr(
      `baseline written: ${baselinePath} (${baseline.fingerprints.length} fingerprints, ${baseline.inputs.length} input(s))\n`,
    );
  }

  return outcome.exitCode;
}

function formatExplain(ruleId: string, explanation: ReturnType<typeof explain>): string {
  if (explanation === undefined) {
    return `rule not found: ${ruleId}\n`;
  }
  const lines = [
    `${explanation.id}  [${explanation.severity}]  (${explanation.category})`,
    "",
    explanation.message,
  ];
  if (explanation.fix !== undefined) {
    lines.push("", `fix: ${explanation.fix}`);
  }
  if (explanation.source !== undefined) {
    lines.push("", `source: ${explanation.source.title}`);
    lines.push(`url: ${explanation.source.url}`);
    if (explanation.source.section !== undefined) {
      lines.push(`section: ${explanation.source.section}`);
    }
  }
  lines.push("", `pack: ${explanation.packId}@${explanation.packVersion}`);
  lines.push("");
  return lines.join("\n");
}

function loadElitePackOrThrow(cwd: string) {
  const dir = findElitePackDir(defaultPackSearchRoots(cwd));
  if (!dir) {
    throw new Error(
      "elite pack not found (searched for packs/elite/pack.yaml from cwd and CLI install)",
    );
  }
  return loadPackFromDir(dir);
}

const PROTOCOL_PACKS = ["graphql", "grpc", "asyncapi", "webhooks"];

function loadProtocolPacks(cwd: string): Rule[] {
  const rules: Rule[] = [];
  for (const id of PROTOCOL_PACKS) {
    const dir = findPackDir(id, defaultPackSearchRoots(cwd));
    if (dir) rules.push(...loadPackFromDir(dir).rules);
  }
  return rules;
}

function loadCustomRulesForRulesCmd(
  rulesFiles: readonly string[],
  cwd: string,
  elitePack?: ReturnType<typeof loadPackFromDir>,
): { ok: true; rules: Rule[] } | { ok: false; error: string } {
  if (rulesFiles.length === 0) return { ok: true, rules: [] };
  try {
    const elite = elitePack ?? loadElitePackOrThrow(cwd);
    const sources: RulesSource[] = rulesFiles.map((path) => ({
      kind: "file" as const,
      path: resolve(cwd, path),
    }));
    return collectCustomRules(sources, packageVersion(), {
      eliteRuleIds: packRuleIds(elite),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function runRulesValidate(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  const parsed = parseRulesArgs(argv);
  if (!parsed.ok) {
    io.stderr(`error: ${parsed.error}\n`);
    return 2;
  }
  // validate takes files as positional (rest), not --rules
  const files = [...parsed.rest];
  if (files.length === 0) {
    io.stderr("error: rules validate requires at least one <file>\n");
    return 2;
  }
  if (parsed.args.rulesFiles.length > 0) {
    io.stderr("error: rules validate takes file arguments, not --rules\n");
    return 2;
  }

  const outcomes = validateRulesFiles(files, packageVersion(), io.cwd);
  const allOk = outcomes.every((o) => o.ok && o.structuralError === undefined);

  if (parsed.args.format === "json") {
    const payload = {
      ok: allOk,
      files: outcomes.map((o) => ({
        file: o.file,
        ok: o.ok && o.structuralError === undefined,
        ruleCount: o.ruleCount,
        ...(o.structuralError !== undefined ? { error: o.structuralError } : {}),
        errors: o.errors,
      })),
    };
    io.stdout(`${JSON.stringify(payload, null, 2)}\n`);
    return allOk ? 0 : 2;
  }

  if (allOk) {
    const total = outcomes.reduce((n, o) => n + o.ruleCount, 0);
    io.stdout(`ok: ${total} rules in ${outcomes.length} file(s)\n`);
    return 0;
  }

  for (const o of outcomes) {
    if (o.structuralError !== undefined) {
      io.stderr(`error: ${o.structuralError}\n`);
      continue;
    }
    for (const e of o.errors) {
      io.stderr(`error: invalid custom rule in ${o.file} #${e.index}: ${e.issues.join("; ")}\n`);
    }
  }
  return 2;
}

function runRulesList(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  const parsed = parseRulesArgs(argv);
  if (!parsed.ok) {
    io.stderr(`error: ${parsed.error}\n`);
    return 2;
  }
  if (parsed.rest.length > 0) {
    io.stderr(`error: unexpected argument: ${parsed.rest[0]}\n`);
    return 2;
  }

  let elite;
  try {
    elite = loadElitePackOrThrow(io.cwd);
  } catch (err) {
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  let custom: Rule[] = [];
  if (parsed.args.rulesFiles.length > 0) {
    const loaded = loadCustomRulesForRulesCmd(parsed.args.rulesFiles, io.cwd, elite);
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    custom = loaded.rules;
  }

  const eliteSorted = [...elite.rules].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const customSorted = [...custom].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (parsed.args.format === "json") {
    const rules = [...eliteSorted, ...customSorted].map((r) => ({
      id: r.id,
      severity: r.severity,
      category: r.category,
      message: r.message,
      packId: r.packId,
      packVersion: r.packVersion,
    }));
    io.stdout(
      `${JSON.stringify(
        {
          packs: [
            { id: elite.id, version: elite.version, count: eliteSorted.length },
            ...(customSorted.length > 0
              ? [
                  {
                    id: "custom",
                    version: packageVersion(),
                    count: customSorted.length,
                  },
                ]
              : []),
          ],
          rules,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const lines: string[] = [`${elite.id}@${elite.version}  ${eliteSorted.length} rules`];
  for (const r of eliteSorted) {
    lines.push(`  ${r.id}  [${r.severity}]  (${r.category})  ${r.message}`);
  }
  if (customSorted.length > 0) {
    lines.push("");
    lines.push(`custom@${packageVersion()}  ${customSorted.length} rules`);
    for (const r of customSorted) {
      lines.push(`  ${r.id}  [${r.severity}]  (${r.category})  ${r.message}`);
    }
  }
  lines.push("");
  io.stdout(lines.join("\n"));
  return 0;
}

function runRulesExplain(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  const parsed = parseRulesArgs(argv);
  if (!parsed.ok) {
    io.stderr(`error: ${parsed.error}\n`);
    return 2;
  }
  const ruleId = parsed.rest[0];
  if (ruleId === undefined || parsed.rest.length > 1) {
    io.stderr("error: rules explain requires exactly one <ruleId>\n");
    return 2;
  }
  if (!/^[A-Z][A-Z0-9]*-\d{3}$/.test(ruleId)) {
    io.stderr(`error: invalid rule id format "${ruleId}" (expected PREFIX-NNN)\n`);
    return 2;
  }

  let pack;
  try {
    pack = loadElitePackOrThrow(io.cwd);
  } catch (err) {
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  let rulesForLookup: Array<Rule> = pack.rules;
  rulesForLookup = [...rulesForLookup, ...loadProtocolPacks(io.cwd)];
  if (parsed.args.rulesFiles.length > 0) {
    const loaded = loadCustomRulesForRulesCmd(parsed.args.rulesFiles, io.cwd, pack);
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    rulesForLookup = [...pack.rules, ...loaded.rules];
  }

  const explanation = explain(rulesForLookup, ruleId);
  if (explanation === undefined) {
    io.stderr(`rule not found: ${ruleId}\n`);
    return 2;
  }
  io.stdout(formatExplain(ruleId, explanation));
  return 0;
}

async function runRulesImport(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
  },
): Promise<number> {
  let from: string | undefined;
  let out = "imported-rules.yaml";
  let configPath: string | undefined;
  let licenseKey: string | undefined;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--from") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --from requires a file path\n");
        return 2;
      }
      from = v;
      continue;
    }
    if (token === "--out") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --out requires a file path\n");
        return 2;
      }
      out = v;
      continue;
    }
    if (token === "--config") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --config requires a file path\n");
        return 2;
      }
      configPath = v;
      continue;
    }
    if (token === "--license-key") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --license-key requires a value\n");
        return 2;
      }
      licenseKey = v;
      continue;
    }
    if (token === "--force") {
      force = true;
      continue;
    }
    if (token === "--no-color") {
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    io.stderr(`error: unexpected argument: ${token}\n`);
    return 2;
  }
  if (from === undefined) {
    io.stderr("error: rules import requires --from <file>\n");
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
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const llmCfg = loadLlmConfig(config.llm, io.env);
  if (llmCfg === undefined) {
    io.stderr(
      "error: llm not configured: set llm.baseUrl in apigovscan.yaml (AI features are optional)\n",
    );
    return 2;
  }

  const fromAbs = resolve(io.cwd, from);
  if (!existsSync(fromAbs)) {
    io.stderr(`error: import file not found: ${from}\n`);
    return 2;
  }
  if (statSync(fromAbs).isDirectory()) {
    io.stderr(`error: import file is a directory: ${from}\n`);
    return 2;
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(fromAbs);
  } catch (err) {
    io.stderr(`error: import file ${from}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  const extracted = await extractText(fromAbs, bytes);
  if (!extracted.ok) {
    io.stderr(`error: ${extracted.error}\n`);
    return 2;
  }

  const outAbs = resolve(io.cwd, out);
  if (existsSync(outAbs) && !force) {
    io.stderr(`error: output exists: ${out} (pass --force to overwrite)\n`);
    return 2;
  }

  const chunks = chunkGuideline(extracted.text);
  if (chunks.length > 1) {
    io.stderr(`note: ${from} split into ${chunks.length} chunks (1 request each)\n`);
  }
  const entries: unknown[] = [];
  for (const chunk of chunks) {
    let text: string;
    try {
      text = await chatCompletion(llmCfg, buildImportMessages(chunk));
    } catch (err) {
      io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 2;
    }
    entries.push(...parseRulesEnvelope(text));
  }

  let eliteIds: ReadonlySet<string> = new Set();
  try {
    eliteIds = packRuleIds(loadElitePackOrThrow(io.cwd));
  } catch {
    // elite pack unavailable here: skip the elite duplicate check
  }
  const { valid, rejected } = validateDrafts(entries, packageVersion(), eliteIds);
  for (const r of rejected) {
    io.stderr(`warning: rejected draft #${r.index}: ${r.issues.join("; ")}\n`);
  }
  if (valid.length === 0) {
    io.stderr("error: no valid rules produced\n");
    return 2;
  }
  try {
    writeFileSync(outAbs, serializeRulesDrafts(valid), "utf8");
  } catch (err) {
    io.stderr(`error: cannot write ${out}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  io.stdout(
    `${valid.length} imported, ${rejected.length} rejected — review ${out} and add it to customRules in apigovscan.yaml\n`,
  );
  return 0;
}

async function runRulesCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
  },
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      [
        "Usage:",
        "  apigovscan rules validate <file...> [--format json]",
        "  apigovscan rules list [--rules <file>] [--format json]",
        "  apigovscan rules explain <ruleId> [--rules <file>]",
        "  apigovscan rules import --from <file> [--out <file>] [--force] [--config <file>] [--license-key <key>]",
        "",
        "validate  Check custom rule files against the DSL (exit 0/2).",
        "list      List active pack rules (and custom rules when --rules is given).",
        "explain   Print message, fix, source URL, and pack version for a rule.",
        "import    Draft custom rules from a guideline doc with your own LLM (exit 0/2).",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub === "validate") {
    return runRulesValidate(rest, io);
  }
  if (sub === "list") {
    return runRulesList(rest, io);
  }
  if (sub === "explain") {
    return runRulesExplain(rest, io);
  }
  if (sub === "import") {
    return runRulesImport(rest, io);
  }
  io.stderr(
    `error: unknown rules subcommand "${sub ?? ""}" (expected: validate | list | explain | import)\n`,
  );
  return 2;
}

function runInitCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      [
        "Usage:",
        "  apigovscan init [dir] [--force] [--skills-dir <dir>] [--config <file>]",
        "",
        "Scaffold apigovscan.yaml and .apigovscan/skills/ for baseline + learn.",
        "Does not overwrite user content without --force (scaffold-only safe).",
        "",
      ].join("\n"),
    );
    return 0;
  }

  let force = false;
  let skillsDirFlag: string | undefined;
  let configPath: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--force") {
      force = true;
      continue;
    }
    if (token === "--skills-dir") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --skills-dir requires a directory path\n");
        return 2;
      }
      skillsDirFlag = v;
      continue;
    }
    if (token === "--config") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --config requires a file path\n");
        return 2;
      }
      configPath = v;
      continue;
    }
    if (token === "--no-color") {
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    positional.push(token);
  }

  if (positional.length > 1) {
    io.stderr(`error: unexpected argument: ${positional[1]}\n`);
    return 2;
  }

  const target = positional[0] ?? ".";
  const targetAbs = resolve(io.cwd, target);
  let isDir = false;
  try {
    isDir = existsSync(targetAbs) && statSync(targetAbs).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    io.stderr(`init target is not a directory: ${target}\n`);
    return 2;
  }

  const configResult = loadConfig(targetAbs, configPath);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }

  const result = runInit(targetAbs, {
    force,
    skillsDirFlag,
    config: configResult.config,
  });
  if (!result.ok) {
    io.stderr(`${result.error}\n`);
    return 2;
  }

  for (const line of formatInitEntries(result.entries, targetAbs)) {
    io.stdout(`${line}\n`);
  }
  return 0;
}

function runLearn(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      [
        "Usage:",
        "  apigovscan learn --report <file> --feedback <file> [--skills-dir <dir>] [--dry-run] [--config <file>]",
        "",
        "Apply feedback decisions to .apigovscan/skills (idempotent, INV-5).",
        "Decisions: false_positive | wontfix | severity_change | confirm | suggest_rule",
        "",
      ].join("\n"),
    );
    return 0;
  }

  let reportPath: string | undefined;
  let feedbackPath: string | undefined;
  let skillsDirFlag: string | undefined;
  let dryRun = false;
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--report") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --report requires a file path\n");
        return 2;
      }
      reportPath = v;
      continue;
    }
    if (token === "--feedback") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --feedback requires a file path\n");
        return 2;
      }
      feedbackPath = v;
      continue;
    }
    if (token === "--skills-dir") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --skills-dir requires a directory path\n");
        return 2;
      }
      skillsDirFlag = v;
      continue;
    }
    if (token === "--config") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --config requires a file path\n");
        return 2;
      }
      configPath = v;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--no-color") {
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    io.stderr(`error: unexpected argument: ${token}\n`);
    return 2;
  }

  if (reportPath === undefined || feedbackPath === undefined) {
    io.stderr("error: learn requires --report and --feedback\n");
    return 2;
  }

  const reportAbs = resolve(io.cwd, reportPath);
  const feedbackAbs = resolve(io.cwd, feedbackPath);

  const reportLoaded = loadReportFile(reportAbs);
  if (!reportLoaded.ok) {
    io.stderr(`error: ${reportLoaded.error}\n`);
    return 2;
  }
  const feedbackLoaded = loadFeedbackFile(feedbackAbs);
  if (!feedbackLoaded.ok) {
    io.stderr(`error: ${feedbackLoaded.error}\n`);
    return 2;
  }

  if (feedbackLoaded.feedback.items.length === 0) {
    io.stdout("ok: no feedback items\n");
    return 0;
  }

  if (
    feedbackLoaded.feedback.reportHash !== undefined &&
    typeof reportLoaded.report.reportHash === "string" &&
    feedbackLoaded.feedback.reportHash !== reportLoaded.report.reportHash
  ) {
    io.stderr("warning: feedback reportHash differs from report (proceeding)\n");
  }

  const configResult = loadConfig(io.cwd, configPath);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const skillsDir = resolveLearnSkillsDir(
    skillsDirFlag,
    configResult.config.skillsDir,
    configResult.config.configDir,
    io.cwd,
  );

  const supPath = join(skillsDir, "suppressions.yaml");
  const sevPath = join(skillsDir, "severities.yaml");
  const existingSuppressions = loadExistingSuppressions(supPath);
  const existingSeverities = loadExistingSeverities(sevPath);

  const patched = buildLearnPatch({
    report: reportLoaded.report,
    feedback: feedbackLoaded.feedback,
    existingSuppressions,
    existingSeverities,
    toolVersion: packageVersion(),
  });
  if (!patched.ok) {
    io.stderr(`error: ${patched.error}\n`);
    return 2;
  }

  for (const w of patched.patch.warnings) {
    io.stderr(`warning: ${w}\n`);
  }

  const supCount = patched.patch.suppressions.length;
  const sevCount = patched.patch.severities.length;
  const draftCount = patched.patch.draftsToWrite.length;
  const confirm = patched.patch.confirmCount;

  if (dryRun) {
    io.stdout(
      `learn(dry-run): ${supCount} suppressions, ${sevCount} severity overrides, ${draftCount} drafts, confirm: ${confirm}\n`,
    );
    for (const p of writeLearnPatch(skillsDir, patched.patch, true).written) {
      io.stdout(`  would write: ${p}\n`);
    }
    return 0;
  }

  const written = writeLearnPatch(skillsDir, patched.patch, false);
  io.stdout(
    `learn: ${supCount} suppressions, ${sevCount} severity overrides, ${draftCount} drafts, confirm: ${confirm}\n`,
  );
  for (const p of written.written) {
    io.stdout(`  wrote: ${p}\n`);
  }
  return 0;
}

async function runSuppressCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      "usage: apigovscan suppress --report <r.json> --fingerprint <fp> --decision false_positive|wontfix|severity_change [--severity <level>] [--reason \"...\"] [--expires YYYY-MM-DD] [--owner <name>] [--skills-dir <dir>] [--config <file>] [--dry-run]\n",
    );
    return 0;
  }
  const parsedArgs = parseSuppressArgs(argv);
  if (!parsedArgs.ok) {
    io.stderr(`error: ${parsedArgs.error}\n`);
    return 2;
  }
  const args = parsedArgs.args;

  const reportAbs = resolve(io.cwd, args.report as string);
  const reportLoaded = loadReportFile(reportAbs);
  if (!reportLoaded.ok) {
    io.stderr(`error: ${reportLoaded.error}\n`);
    return 2;
  }
  const configResult = loadConfig(io.cwd, args.config);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const skillsDir = resolveLearnSkillsDir(
    args.skillsDir,
    configResult.config.skillsDir,
    configResult.config.configDir,
    io.cwd,
  );

  const patched = buildLearnPatch({
    report: reportLoaded.report,
    feedback: {
      items: [
        {
          fingerprint: args.fingerprint as string,
          decision: args.decision as "false_positive" | "wontfix" | "severity_change",
          ...(args.reason !== undefined ? { comment: args.reason } : {}),
          ...(args.severity !== undefined ? { severity: args.severity } : {}),
          ...(args.expires !== undefined ? { expires: args.expires } : {}),
          ...(args.owner !== undefined ? { owner: args.owner } : {}),
        },
      ],
    },
    existingSuppressions: loadExistingSuppressions(join(skillsDir, "suppressions.yaml")),
    existingSeverities: loadExistingSeverities(join(skillsDir, "severities.yaml")),
    toolVersion: packageVersion(),
  });
  if (!patched.ok) {
    io.stderr(`error: ${patched.error}\n`);
    return 2;
  }

  for (const w of patched.patch.warnings) {
    io.stderr(`warning: ${w}\n`);
  }

  const supCount = patched.patch.suppressions.length;
  const sevCount = patched.patch.severities.length;

  if (args.dryRun) {
    io.stdout(`suppress(dry-run): ${supCount} suppressions, ${sevCount} severity overrides\n`);
    for (const p of writeLearnPatch(skillsDir, patched.patch, true).written) {
      io.stdout(`  would write: ${p}\n`);
    }
    return 0;
  }

  const written = writeLearnPatch(skillsDir, patched.patch, false);
  io.stdout(`suppress: ${supCount} suppressions, ${sevCount} severity overrides\n`);
  for (const p of written.written) {
    io.stdout(`  wrote: ${p}\n`);
  }
  return 0;
}

function runSkillsCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      [
        "Usage:",
        "  apigovscan skills list [--format json] [--skills-dir <dir>] [--config <file>]",
        "  apigovscan skills promote <draftId> [--skills-dir <dir>] [--config <file>]",
        "",
        "list      Show suppressions, severity overrides, and drafts.",
        "promote   Flip draft: true → false so the rule is evaluated.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const sub = argv[0];
  const rest = argv.slice(1);

  let format: "console" | "json" = "console";
  let skillsDirFlag: string | undefined;
  let configPath: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--format") {
      const v = rest[++i];
      if (v !== "console" && v !== "json") {
        io.stderr("error: --format must be console | json\n");
        return 2;
      }
      format = v;
      continue;
    }
    if (token === "--skills-dir") {
      const v = rest[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --skills-dir requires a directory path\n");
        return 2;
      }
      skillsDirFlag = v;
      continue;
    }
    if (token === "--config") {
      const v = rest[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --config requires a file path\n");
        return 2;
      }
      configPath = v;
      continue;
    }
    if (token === "--no-color") {
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    positional.push(token);
  }

  const configResult = loadConfig(io.cwd, configPath);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const skillsDir = resolveLearnSkillsDir(
    skillsDirFlag,
    configResult.config.skillsDir,
    configResult.config.configDir,
    io.cwd,
  );

  if (sub === "list") {
    if (positional.length > 0) {
      io.stderr(`error: unexpected argument: ${positional[0]}\n`);
      return 2;
    }
    const listed = listSkills(skillsDir, packageVersion());
    if (!listed.ok) {
      io.stderr(`error: ${listed.error}\n`);
      return 2;
    }
    const { suppressions, severities, drafts } = listed.inventory;
    const activeDrafts = drafts.filter((d) => !d.draft);
    const pendingDrafts = drafts.filter((d) => d.draft);

    if (format === "json") {
      io.stdout(
        `${JSON.stringify(
          {
            skillsDir,
            suppressions,
            severities,
            drafts: drafts.map((d) => ({
              id: d.id,
              draft: d.draft,
              severity: d.severity,
            })),
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }

    const lines: string[] = [`skills: ${skillsDir}`, ""];
    lines.push(`suppressions: ${suppressions.length}`);
    for (const s of suppressions) {
      const extra = [
        ...(s.owner !== undefined ? [`owner=${s.owner}`] : []),
        ...(s.expires !== undefined ? [`expires=${s.expires}`] : []),
      ].join(" ");
      const suffix = extra === "" ? "" : `  [${extra}]`;
      if (s.fingerprint !== undefined) {
        lines.push(`  fp ${s.fingerprint.slice(0, 12)}…  ${s.reason}${suffix}`);
      } else if (s.match !== undefined) {
        const api = s.match.apiPath !== undefined ? ` apiPath=${s.match.apiPath}` : "";
        lines.push(`  match ${s.match.ruleId}${api}  ${s.reason}${suffix}`);
      }
    }
    lines.push(`overrides: ${severities.length}`);
    for (const o of severities) {
      lines.push(`  ${o.ruleId} → ${o.severity}`);
    }
    lines.push(`drafts:`);
    if (drafts.length === 0) {
      lines.push("  (none)");
    }
    for (const d of pendingDrafts) {
      lines.push(`  ${d.id}  [draft]${d.severity ? ` ${d.severity}` : ""}`);
    }
    for (const d of activeDrafts) {
      lines.push(`  ${d.id}  [active]${d.severity ? ` ${d.severity}` : ""}`);
    }
    lines.push("");
    io.stdout(lines.join("\n"));
    return 0;
  }

  if (sub === "promote") {
    const draftId = positional[0];
    if (draftId === undefined || positional.length > 1) {
      io.stderr("error: skills promote requires exactly one <draftId>\n");
      return 2;
    }
    if (!/^[A-Z][A-Z0-9]*-\d{3}$/.test(draftId)) {
      io.stderr(`error: invalid draft id format "${draftId}" (expected PREFIX-NNN)\n`);
      return 2;
    }
    const promoted = promoteDraft(skillsDir, draftId);
    if (!promoted.ok) {
      io.stderr(`error: ${promoted.error}\n`);
      return 2;
    }
    io.stdout(`promoted: ${promoted.path}\n`);
    return 0;
  }

  io.stderr(`error: unknown skills subcommand "${sub ?? ""}" (expected: list | promote)\n`);
  return 2;
}

function getMcpHelp(): string {
  return [
    "apigovscan mcp — MCP stdio server (local-first)",
    "",
    "Usage:",
    "  apigovscan mcp [--help]",
    "",
    "Tools (FR-50):",
    "  analyze_spec(path, failOn?, rules?)",
    "  list_rules(rules?)",
    "  explain_rule(ruleId, rules?)",
    "  validate_custom_rules(files[])",
    "  explain_finding(reportPath, fingerprint)",
    "  suggest_fix(reportPath, fingerprint) — LLM draft only, needs llm.baseUrl",
    "",
    "Paths are sandboxed under the process cwd. analyze_spec output is truncated.",
    "Same engine as the CLI; stateless between calls; zero network (INV-1).",
    "",
    "Client registration (Claude / Cursor / opencode):",
    '  { "mcpServers": { "apigovscan": { "command": "npx", "args": ["-y", "@apigovscan/cli", "mcp"] } } }',
    "",
  ].join("\n");
}

async function runMcpCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
  },
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(`${getMcpHelp()}\n`);
    return 0;
  }
  const unexpected = argv.find((a) => !a.startsWith("-"));
  if (unexpected !== undefined) {
    io.stderr(`error: unexpected argument: ${unexpected}\n`);
    return 2;
  }

  const configResult = loadConfig(io.cwd, undefined);
  const configKey = configResult.ok ? configResult.config.license?.key : undefined;
  const license = checkLicense({
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: configKey,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  try {
    const handlers = createCliMcpHandlers(io.cwd);
    const server = createMcpServer(handlers, {
      cwd: io.cwd,
      name: "apigovscan",
      version: packageVersion(),
    });
    await startStdioServer(server);
    return 0;
  } catch (err) {
    io.stderr(`error: mcp server failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
}

function runLicenseCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
  },
): number {
  let keyFlag: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--key") {
      const value = argv[++i];
      if (value === undefined || (value.startsWith("-") && value !== "-")) {
        io.stderr("error: --key requires a value\n");
        return 2;
      }
      keyFlag = value;
      continue;
    }
    if (token === "--help" || token === "-h") {
      io.stdout("usage: apigovscan license [--key <AGS-...>]\n");
      return 0;
    }
    io.stderr(`error: unknown option: ${token}\n`);
    return 2;
  }
  const configResult = loadConfig(io.cwd, undefined);
  const configKey = configResult.ok ? configResult.config.license?.key : undefined;
  const license = checkLicense({
    flag: keyFlag,
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: configKey,
  });
  if (license.ok) {
    io.stdout(
      `license valid · customer ${license.info.customer} · expires ${license.info.expiry}\n`,
    );
    return 0;
  }
  io.stderr(`error: ${licenseErrorMessage(license)}\n`);
  return 2;
}

async function runFixCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
    readStdin: () => Promise<Uint8Array>;
  },
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      "usage: apigovscan fix <path> [--fingerprint <fp>] [--config <file>] [--license-key <key>]\n",
    );
    return 0;
  }
  const parsedArgs = parseFixArgs(argv);
  if (!parsedArgs.ok) {
    io.stderr(`error: ${parsedArgs.error}\n`);
    return 2;
  }
  const args = parsedArgs.args;

  if (args.fingerprint !== undefined && !/^[0-9a-f]{8,64}$/.test(args.fingerprint)) {
    io.stderr("error: invalid fingerprint (expected 8-64 hex chars; a unique prefix is enough)\n");
    return 2;
  }

  const configResult = loadConfig(io.cwd, args.config);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const config = configResult.config;

  if (config.standards?.pack !== undefined && config.standards.pack !== "elite") {
    io.stderr(
      `error: unknown pack "${config.standards.pack}" (f1 ships only the embedded "elite" pack)\n`,
    );
    return 2;
  }

  // Same license gate as analyze: fix runs the full analysis in memory.
  const license = checkLicense({
    flag: args.licenseKey,
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const llmCfg = loadLlmConfig(config.llm, io.env);
  if (llmCfg === undefined) {
    io.stderr(
      "error: llm not configured: set llm.baseUrl in apigovscan.yaml (AI features are optional)\n",
    );
    return 2;
  }

  let inputs: string[];
  const inputPath = resolve(io.cwd, args.path);
  if (args.path === "-") {
    io.stderr("error: fix requires a file or directory (stdin is not supported)\n");
    return 2;
  } else if (!existsSync(inputPath)) {
    io.stderr(`error: input not found: ${args.path}\n`);
    return 2;
  } else if (statSync(inputPath).isDirectory()) {
    const discovered = discoverSpecs(inputPath);
    if (!discovered.ok) {
      io.stderr(`error: ${discovered.error}\n`);
      return 2;
    }
    inputs = discovered.paths.map((p) => resolve(inputPath, p));
  } else {
    inputs = [inputPath];
  }

  const prepared = prepareAnalysis(io.cwd, config, {
    rulesFiles: [],
    skillsDir: undefined,
    baselineMode: config.baseline?.enabled === true ? "read" : "off",
  });
  if (!prepared.ok) {
    io.stderr(`error: ${prepared.error}\n`);
    return 2;
  }
  const setup = prepared.setup;

  const outcome = await analyzeUseCase(
    {
      loader: createFsSpecLoader(io.readStdin),
      packs: createFsPackRepository(io.cwd),
      sink: {
        async write() {},
      },
    },
    {
      inputs,
      labelFor: (p) => normalizeLabel(p, io.cwd),
      failOn: "never",
      customRules: setup.customRules,
      disabledRuleIds: setup.disabledRuleIds,
      severityOverrides: setup.severityOverrides,
      toolVersion: packageVersion(),
      baselineFingerprints: setup.baselineFingerprints,
      skillsSuppressions: setup.skillsSuppressions,
    },
  );
  if (!outcome.ok) {
    io.stderr(`error: ${outcome.error}\n`);
    return outcome.exitCode;
  }

  let findings = outcome.report.findings;
  if (args.fingerprint !== undefined) {
    const resolved = resolveFingerprint(
      findings.map((f) => f.fingerprint),
      args.fingerprint,
    );
    if (!resolved.ok) {
      io.stderr(`error: ${resolved.error}\n`);
      return 2;
    }
    findings = findings.filter((f) => f.fingerprint === resolved.fingerprint);
  }
  if (findings.length === 0) {
    io.stdout("no fixable findings\n");
    return 0;
  }

  const labels = outcome.report.input.map((i) => i.path);
  for (let index = 0; index < findings.length; index++) {
    const finding = findings[index]!;
    const explanation = explain(setup.lookupRules, finding.ruleId);
    if (explanation === undefined) {
      io.stderr(`error: rule not found: ${finding.ruleId}\n`);
      return 2;
    }
    const target = splitFindingTarget(finding.location, labels);
    const specAbs =
      target.label !== undefined
        ? resolve(io.cwd, target.label)
        : inputs.length === 1
          ? inputs[0]!
          : undefined;
    if (specAbs === undefined || !existsSync(specAbs)) {
      io.stderr(`error: spec file not found: ${target.label ?? finding.location}\n`);
      return 2;
    }
    const specText = readFileSync(specAbs, "utf8");
    const { fragment } = extractSpecFragment(specText, target.pointer);
    const fileLabel = target.label ?? normalizeLabel(specAbs, io.cwd);
    let patch: string;
    let explanationText: string;
    let confidence: string;
    try {
      const text = await chatCompletion(
        llmCfg,
        buildFixMessages({
          fileLabel,
          ruleId: finding.ruleId,
          severity: finding.severity,
          message: finding.message,
          location: finding.location,
          ...(explanation.fix !== undefined ? { fixHint: explanation.fix } : {}),
          ...(explanation.examples !== undefined ? { examples: explanation.examples } : {}),
          ...(explanation.source !== undefined
            ? {
                source: {
                  title: explanation.source.title,
                  ...(explanation.source.url !== undefined ? { url: explanation.source.url } : {}),
                },
              }
            : {}),
          fragment,
        }),
      );
      const parsed = parseFixResponse(text);
      if (!parsed.ok) {
        io.stderr(`error: ${parsed.error}\n`);
        return 2;
      }
      patch = parsed.fix.patch;
      explanationText = parsed.fix.explanation;
      confidence = parsed.fix.confidence;
    } catch (err) {
      io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 2;
    }
    if (index > 0) {
      io.stdout("\n");
    }
    io.stdout(
      [
        `fix  ${finding.ruleId}  ${finding.location}  (${finding.fingerprint.slice(0, 8)})`,
        `explanation: ${explanationText}`,
        `confidence: ${confidence} (LLM-declared)`,
        "",
        patch,
      ].join("\n") + "\n",
    );
  }
  return 0;
}

function formatDriftConsole(
  dir: string,
  spec: string | undefined,
  report: {
    missing: Array<{ method: string; path: string }>;
    removed: Array<{ method: string; path: string }>;
    changed: Array<{ path: string; specMethods: string[]; codeMethods: string[] }>;
    shapeNotes: Array<{ op: string; outputChanged: boolean; confidence: string; note: string }>;
  },
): string {
  const lines: string[] = [spec !== undefined ? `drift ${dir} vs ${spec}` : `drift ${dir}`, ""];
  if (
    report.missing.length === 0 &&
    report.removed.length === 0 &&
    report.changed.length === 0 &&
    report.shapeNotes.length === 0
  ) {
    lines.push("no drift detected");
    return `${lines.join("\n")}\n`;
  }
  lines.push(`missing (${report.missing.length}):`);
  for (const e of report.missing) lines.push(`  ${e.method} ${e.path}`);
  lines.push(`removed (${report.removed.length}):`);
  for (const e of report.removed) lines.push(`  ${e.method} ${e.path}`);
  lines.push(`changed (${report.changed.length}):`);
  for (const c of report.changed) {
    lines.push(
      `  ${c.path}  spec [${c.specMethods.join(", ")}]  code [${c.codeMethods.join(", ")}]`,
    );
  }
  if (report.shapeNotes.length > 0) {
    lines.push(`shape notes (${report.shapeNotes.length}):`);
    for (const s of report.shapeNotes) {
      const verdict = s.outputChanged ? "changed" : "unchanged";
      lines.push(`  ${s.op}  ${verdict} (confidence ${s.confidence}): ${s.note}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function codeFragmentAround(fileAbs: string, line: number | undefined, radius = 20): string {
  let text: string;
  try {
    text = readFileSync(fileAbs, "utf8");
  } catch {
    return "(location unavailable)";
  }
  if (line === undefined) return "(location unavailable)";
  const lines = text.split("\n");
  const from = Math.max(0, line - 1 - radius);
  const to = Math.min(lines.length, line + radius);
  return lines.slice(from, to).join("\n");
}

async function runDriftCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
  },
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      "usage: apigovscan drift <dir> [--spec <file>] [--out <file>] [--format console|json] [--config <file>] [--license-key <key>] [--force]\n",
    );
    return 0;
  }
  const parsedArgs = parseDriftArgs(argv);
  if (!parsedArgs.ok) {
    io.stderr(`error: ${parsedArgs.error}\n`);
    return 2;
  }
  const args = parsedArgs.args;

  const dirAbs = resolve(io.cwd, args.dir);
  if (!existsSync(dirAbs)) {
    io.stderr(`error: drift directory not found: ${args.dir}\n`);
    return 2;
  }
  if (!statSync(dirAbs).isDirectory()) {
    io.stderr(`error: drift target is not a directory: ${args.dir}\n`);
    return 2;
  }

  const configResult = loadConfig(io.cwd, args.config);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const config = configResult.config;

  const license = checkLicense({
    flag: args.licenseKey,
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const llmCfg = loadLlmConfig(config.llm, io.env);

  const collected = collectSourceFiles(dirAbs, (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return undefined;
    }
  });
  if (collected.truncated) {
    io.stderr("note: source scan truncated (file/size caps); results may be partial\n");
  }
  if (collected.skippedUnreadable > 0) {
    io.stderr(`note: skipped ${collected.skippedUnreadable} unreadable file(s)\n`);
  }
  let routes = collected.routes;
  if (routes.length === 0 && llmCfg !== undefined) {
    let text: string;
    try {
      text = await chatCompletion(llmCfg, buildSweepMessages(collected.files));
    } catch (err) {
      io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 2;
    }
    routes = parseSweepResponse(text);
    if (routes.length === 0) {
      io.stderr("note: sweep returned no routes\n");
    }
  }
  if (routes.length === 0 && llmCfg === undefined) {
    io.stderr("note: no routes detected (configure llm for deep scan)\n");
  }

  if (args.spec !== undefined) {
    const specAbs = resolve(io.cwd, args.spec);
    if (!existsSync(specAbs)) {
      io.stderr(`error: spec file not found: ${args.spec}\n`);
      return 2;
    }
    let specText: string;
    try {
      specText = readFileSync(specAbs, "utf8");
    } catch (err) {
      io.stderr(
        `error: spec file ${args.spec}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    const parsed = parseSpec(specText, { sourceLabel: args.spec });
    if (!parsed.ok) {
      const detail = parsed.errors
        .map((e) =>
          e.line !== undefined
            ? `line ${e.line}: ${e.message}`
            : e.jsonPointer !== undefined
              ? `${e.jsonPointer}: ${e.message}`
              : e.message,
        )
        .join("; ");
      io.stderr(`error: spec parse error: ${detail}\n`);
      return 2;
    }
    const specOps = parsed.spec.operations.map((o) => ({
      method: o.method,
      path: o.path,
    }));
    const compared = compareEndpoints(specOps, routes);
    let shapeNotes: Array<{
      op: string;
      outputChanged: boolean;
      confidence: string;
      note: string;
    }> = [];
    if (llmCfg !== undefined) {
      const matched = parsed.spec.operations
        .filter((o) =>
          routes.some(
            (r) => r.path === o.path && (r.method === "*" || r.method === o.method.toUpperCase()),
          ),
        )
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : 1))
        .slice(0, MAX_SHAPE_PAIRS);
      if (matched.length > 0) {
        const pairs = matched.map((o) => {
          const route = routes.find(
            (r) => r.path === o.path && (r.method === "*" || r.method === o.method.toUpperCase()),
          )!;
          const codeFragment =
            route.file === "unknown" || route.file.startsWith("<stdin>")
              ? "(location unavailable)"
              : codeFragmentAround(resolve(dirAbs, route.file), route.line);
          return {
            op: `${o.method.toUpperCase()} ${o.path}`,
            specFragment: JSON.stringify(o).slice(0, MAX_FRAGMENT_CHARS),
            codeFragment,
          };
        });
        try {
          const text = await chatCompletion(llmCfg, buildShapeMessages(pairs));
          shapeNotes = parseShapeResponse(text);
        } catch (err) {
          io.stderr(
            `note: shape analysis unavailable: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }
    } else {
      io.stderr("note: shape analysis requires llm (endpoint-level only)\n");
    }
    const report = { ...compared, shapeNotes };
    if (args.format === "json") {
      io.stdout(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      io.stdout(formatDriftConsole(args.dir, args.spec, report));
    }
    return compared.missing.length + compared.removed.length + compared.changed.length > 0 ? 1 : 0;
  }

  if (routes.length === 0) {
    io.stderr(`error: no routes detected in ${args.dir}\n`);
    return 2;
  }
  const out = args.out ?? "openapi.draft.yaml";
  const outAbs = resolve(io.cwd, out);
  if (existsSync(outAbs) && !args.force) {
    io.stderr(`error: output exists: ${out} (pass --force to overwrite)\n`);
    return 2;
  }
  const skeleton = buildSpecSkeleton(routes, args.dir);
  try {
    writeFileSync(outAbs, skeleton, "utf8");
  } catch (err) {
    io.stderr(`error: cannot write ${out}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  const opCount = new Set(
    routes.filter((r) => r.method !== "*").map((r) => `${r.method} ${r.path}`),
  ).size;
  io.stdout(`draft written: ${out} (${opCount} operations)\n`);
  return 0;
}

function formatScanConsole(
  display: string,
  report: {
    groups: Array<{
      name: string;
      repos: Array<{
        name: string;
        specs: number;
        findings: number;
        errors: number;
        warnings: number;
        infos: number;
        score: number;
        grade: string;
        coverage: number;
      }>;
    }>;
    totals: {
      repos: number;
      specs: number;
      findings: number;
      errors: number;
      warnings: number;
      infos: number;
    };
    avgScore: number;
    avgCoverage: number;
    skipped: Array<{ name: string; reason: string }>;
  },
): string {
  const lines: string[] = [`scan-org ${display} (${report.totals.repos} repos)`, ""];
  for (const group of report.groups) {
    lines.push(`[${group.name}]`);
    for (const repo of group.repos) {
      lines.push(
        `  ${repo.name}  ${repo.score} (${repo.grade})  ${repo.findings} findings ` +
          `(${repo.errors}e ${repo.warnings}w ${repo.infos}i)  ${repo.specs} specs  cov ${repo.coverage}%`,
      );
    }
    lines.push("");
  }
  const t = report.totals;
  lines.push(
    `totals: ${t.repos} repos, ${t.specs} specs, ${t.findings} findings ` +
      `(${t.errors}e ${t.warnings}w ${t.infos}i), avg score ${report.avgScore}, avg coverage ${report.avgCoverage}%`,
  );
  if (report.skipped.length > 0) {
    lines.push(`skipped (${report.skipped.length}):`);
    for (const s of report.skipped) {
      lines.push(`  ${s.name}: ${s.reason}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function analyzeProjectDir(
  repoDir: string,
  config: AnalyzeConfig,
): Promise<
  | {
      ok: true;
      specs: number;
      summary: { error: number; warning: number; info: number; total: number };
      score: { value: number; grade: string };
      coverage: number;
    }
  | { ok: false; error: string }
> {
  const discovered = discoverSpecs(repoDir);
  if (!discovered.ok) {
    return { ok: false, error: "no specs found" };
  }
  const prepared = prepareAnalysis(repoDir, config, {
    rulesFiles: [],
    skillsDir: undefined,
    baselineMode: config.baseline?.enabled === true ? "read" : "off",
  });
  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }
  const setup = prepared.setup;
  const outcome = await analyzeUseCase(
    {
      loader: createFsSpecLoader(),
      packs: createFsPackRepository(repoDir),
      sink: {
        async write() {},
      },
    },
    {
      inputs: discovered.paths.map((p) => resolve(repoDir, p)),
      labelFor: (p) => normalizeLabel(p, repoDir),
      failOn: "never",
      customRules: setup.customRules,
      disabledRuleIds: setup.disabledRuleIds,
      severityOverrides: setup.severityOverrides,
      toolVersion: packageVersion(),
      baselineFingerprints: setup.baselineFingerprints,
      skillsSuppressions: setup.skillsSuppressions,
    },
  );
  if (!outcome.ok) {
    return { ok: false, error: outcome.error };
  }
  return {
    ok: true,
    specs: discovered.paths.length,
    summary: {
      error: outcome.report.summary.error,
      warning: outcome.report.summary.warning,
      info: outcome.report.summary.info,
      total: outcome.report.summary.total,
    },
    score: {
      value: outcome.report.score.value,
      grade: outcome.report.score.grade,
    },
    coverage: outcome.report.coverage?.pct ?? 0,
  };
}

function loadRepoConfig(
  repoDir: string,
): { ok: true; config: AnalyzeConfig } | { ok: false; error: string } {
  return loadConfig(repoDir, undefined);
}

async function runDashboardCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): Promise<number> {
  const parsed = parseDashboardArgs(argv);
  if (!parsed.ok) {
    io.stderr(`error: ${parsed.error}\n${dashboardHelp()}\n`);
    return 2;
  }
  const args = parsed.args;
  const { reportPath, trackingPath } = resolveDashboardPaths(io.cwd, args.report, args.tracking);

  const loaded = loadDashboardReportFile(reportPath);
  if (!loaded.ok) {
    io.stderr(`error: ${loaded.error}\n`);
    return 2;
  }
  const report = loaded.report;

  const trackingLoaded = loadTrackingFile(trackingPath);
  if (!trackingLoaded.ok) {
    io.stderr(`error: ${trackingLoaded.error}\n`);
    return 2;
  }

  let groups: Record<string, string> = {};
  if (args.groupBy !== undefined) {
    const groupAbs = resolve(io.cwd, args.groupBy);
    if (!existsSync(groupAbs)) {
      io.stderr(`error: group file not found: ${args.groupBy}\n`);
      return 2;
    }
    let groupText: string;
    try {
      groupText = readFileSync(groupAbs, "utf8");
    } catch (err) {
      io.stderr(
        `error: group file ${args.groupBy}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    const mapping = loadOwnerMapping(groupText);
    if (!mapping.ok) {
      io.stderr(`error: ${mapping.error}\n`);
      return 2;
    }
    groups = mapping.mapping;
  }

  let trends: DashboardPayload["trends"] = undefined;
  if (args.against !== undefined) {
    const againstAbs = resolve(io.cwd, args.against);
    const against = loadDashboardReportFile(againstAbs);
    if (!against.ok) {
      io.stderr(`error: ${against.error}\n`);
      return 2;
    }
    trends = compareReports(report, against.report);
  }

  const payload: DashboardPayload = {
    report,
    tracking: trackingLoaded.tracking,
    groups,
    trends,
    reportFile: args.report,
  };
  const pageHtml = renderDashboardPage();

  let server_: Awaited<ReturnType<typeof startDashboardServer>>;
  try {
    server_ = await startDashboardServer(
      {
        payload: () => {
          const current = loadTrackingFile(trackingPath);
          return {
            ...payload,
            tracking: current.ok ? current.tracking : payload.tracking,
          };
        },
        trackingPath,
        pageHtml,
      },
      args.port,
    );
  } catch (err) {
    io.stderr(
      `error: cannot start dashboard: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  io.stdout(`dashboard at ${server_.url} (local only, press Ctrl+C to stop)\n`);
  await new Promise<void>((resolvePromise) => {
    const onSigint = (): void => {
      server_.server.close(() => resolvePromise());
      process.removeListener("SIGINT", onSigint);
      setTimeout(() => resolvePromise(), 1000).unref?.();
    };
    process.on("SIGINT", onSigint);
  });
  return 0;
}

async function runDiffCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
    isTTY: boolean;
  },
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      "usage: apigovscan diff <old> <new> [--format <fmt>] [--output <file>] [--fail-on <sev>] [--skills-dir <dir>] [--config <file>] [--license-key <key>] [--no-color]\n",
    );
    return 0;
  }
  const parsedArgs = parseDiffArgs(argv);
  if (!parsedArgs.ok) {
    io.stderr(`error: ${parsedArgs.error}\n`);
    return 2;
  }
  const args = parsedArgs.args;
  if (args.oldPath === "-" || args.newPath === "-") {
    io.stderr("error: diff does not support stdin (pass two spec files)\n");
    return 2;
  }

  const configResult = loadConfig(io.cwd, args.config);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const config = configResult.config;

  const license = checkLicense({
    flag: args.licenseKey,
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const failOn = mergeFailOn(args.failOn, config, io.stderr);

  const oldAbs = resolve(io.cwd, args.oldPath);
  const newAbs = resolve(io.cwd, args.newPath);
  if (!existsSync(oldAbs)) {
    io.stderr(`error: input not found: ${args.oldPath}\n`);
    return 2;
  }
  if (!existsSync(newAbs)) {
    io.stderr(`error: input not found: ${args.newPath}\n`);
    return 2;
  }
  const oldLabel = normalizeLabel(oldAbs, io.cwd);
  const newLabel = normalizeLabel(newAbs, io.cwd);

  let oldBytes: Uint8Array;
  let newBytes: Uint8Array;
  try {
    oldBytes = readFileSync(oldAbs);
    newBytes = readFileSync(newAbs);
  } catch (err) {
    io.stderr(`error: cannot read spec: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const oldParsed = parseSpecInput(args.oldPath, oldBytes, oldLabel);
  if (!oldParsed.ok) {
    io.stderr(`error: ${oldParsed.error}\n`);
    return 2;
  }
  const newParsed = parseSpecInput(args.newPath, newBytes, newLabel);
  if (!newParsed.ok) {
    io.stderr(`error: ${newParsed.error}\n`);
    return 2;
  }

  const prepared = prepareAnalysis(io.cwd, config, {
    rulesFiles: [],
    skillsDir: args.skillsDir,
    baselineMode: "off",
  });
  if (!prepared.ok) {
    io.stderr(`error: ${prepared.error}\n`);
    return 2;
  }
  const setup = prepared.setup;

  const started = performance.now();
  let findings = diffSpecs(oldParsed.spec, newParsed.spec, {
    oldLabel,
    newLabel,
    packVersion: packageVersion(),
  }).findings;

  findings = findings.filter((f) => !setup.disabledRuleIds.has(f.ruleId));
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
  if (
    setup.skillsSuppressions !== undefined &&
    setup.skillsSuppressions.suppressions.length > 0
  ) {
    const { suppressions, matchRegexes } = setup.skillsSuppressions;
    const applied = applySkillSuppressions(findings, suppressions, matchRegexes);
    skillsSuppressedCount = applied.suppressed;
    findings = applied.visible;
    const matched = new Set(applied.matchedIndexes);
    const expired = new Set(applied.expiredIndexes);
    for (const i of applied.expiredIndexes) {
      const sup = suppressions[i]!;
      skillsWarnings.push(
        `suppression expired (ignored): ${describeSuppression(sup)} (expires ${sup.expires})`,
      );
    }
    for (let i = 0; i < suppressions.length; i++) {
      if (!matched.has(i) && !expired.has(i)) {
        skillsWarnings.push(
          `suppression matches no findings: ${describeSuppression(suppressions[i]!)}`,
        );
      }
    }
  }

  const report = buildReport({
    results: [{ findings, errors: [] }],
    inputs: [
      { path: oldLabel, sha256: `sha256:${oldParsed.spec.inputHash}` },
      { path: newLabel, sha256: `sha256:${newParsed.spec.inputHash}` },
    ],
    packs: [{ id: DIFF_PACK_ID, version: packageVersion() }],
    toolVersion: packageVersion(),
    meta: { durationMs: Math.round(performance.now() - started) },
    ...(skillsSuppressedCount > 0 ? { skillsSuppressed: skillsSuppressedCount } : {}),
  });

  const noColor = args.noColor || (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== "");
  const color = !noColor && io.isTTY;
  const pretty = args.format === "json" && io.isTTY && args.output === undefined;
  try {
    await createReportSink({
      format: args.format,
      color,
      pretty,
      output: args.output !== undefined ? resolve(io.cwd, args.output) : undefined,
      stdout: io.stdout,
    }).write(report);
  } catch (err) {
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  for (const w of skillsWarnings) {
    io.stderr(`warning: ${w}\n`);
  }
  return computeExitCode(report, failOn);
}

async function runScanOrgCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    env: Record<string, string | undefined>;
    cwd: string;
  },
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(
      "usage: apigovscan scan-org <dir> [--github <org>] [--group-by <file>] [--format console|json] [--out <file>] [--config <file>] [--license-key <key>] [--force] [--max-repos <n>] [--workdir <dir>] [--api-base <url>]\n",
    );
    return 0;
  }
  const parsedArgs = parseScanOrgArgs(argv);
  if (!parsedArgs.ok) {
    io.stderr(`error: ${parsedArgs.error}\n`);
    return 2;
  }
  const args = parsedArgs.args;

  const dirAbs = resolve(io.cwd, args.dir);
  if (!existsSync(dirAbs)) {
    io.stderr(`error: scan directory not found: ${args.dir}\n`);
    return 2;
  }
  if (!statSync(dirAbs).isDirectory()) {
    io.stderr(`error: scan target is not a directory: ${args.dir}\n`);
    return 2;
  }

  const configResult = loadConfig(io.cwd, args.config);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const config = configResult.config;

  const license = checkLicense({
    flag: args.licenseKey,
    env: io.env.APIGOVSCAN_LICENSE_KEY,
    config: config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  let mapping: Record<string, string> | undefined;
  if (args.groupBy !== undefined) {
    const groupAbs = resolve(io.cwd, args.groupBy);
    if (!existsSync(groupAbs)) {
      io.stderr(`error: group file not found: ${args.groupBy}\n`);
      return 2;
    }
    let groupText: string;
    try {
      groupText = readFileSync(groupAbs, "utf8");
    } catch (err) {
      io.stderr(
        `error: group file ${args.groupBy}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    const loaded = loadGroupMapping(groupText);
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    mapping = loaded.mapping;
  }

  let scanRoot = dirAbs;
  const skipped: SkippedRepo[] = [];
  if (args.github !== undefined) {
    const token = io.env.GITHUB_TOKEN;
    if (token === undefined || token === "") {
      io.stderr("error: --github requires GITHUB_TOKEN\n");
      return 2;
    }
    const listed = await listOrgRepos(args.apiBase, args.github, token, args.maxRepos);
    if (!listed.ok) {
      io.stderr(`error: ${listed.error}\n`);
      return 2;
    }
    if (listed.repos.length === args.maxRepos) {
      io.stderr(`note: repo list truncated at --max-repos ${args.maxRepos}\n`);
    }
    const workdir =
      args.workdir !== undefined
        ? resolve(io.cwd, args.workdir)
        : mkdtempSync(join(tmpdir(), "apigovscan-scan-"));
    if (args.workdir !== undefined && !existsSync(workdir)) {
      io.stderr(`error: workdir not found: ${args.workdir}\n`);
      return 2;
    }
    scanRoot = workdir;
    for (const repo of listed.repos) {
      const dest = join(workdir, repo.name);
      if (existsSync(dest)) {
        skipped.push({ name: repo.name, reason: "destination exists" });
        io.stderr(`warning: skipped ${repo.name}: destination exists\n`);
        continue;
      }
      const cloned = await cloneRepo(repo.cloneUrl, dest);
      if (!cloned.ok) {
        skipped.push({ name: repo.name, reason: cloned.error });
        io.stderr(`warning: skipped ${repo.name}: ${cloned.error}\n`);
      }
    }
  }

  let entries: string[];
  try {
    entries = readdirSync(scanRoot).sort();
  } catch (err) {
    io.stderr(
      `error: cannot read ${args.dir}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  const scans: RepoScan[] = [];
  for (const entry of entries) {
    const projectDir = join(scanRoot, entry);
    let isDir = false;
    try {
      isDir = statSync(projectDir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) {
      continue;
    }
    const repoConfig = loadRepoConfig(projectDir);
    if (!repoConfig.ok) {
      skipped.push({ name: entry, reason: repoConfig.error });
      io.stderr(`warning: skipped ${entry}: ${repoConfig.error}\n`);
      continue;
    }
    const analyzed = await analyzeProjectDir(projectDir, repoConfig.config);
    if (!analyzed.ok) {
      skipped.push({ name: entry, reason: analyzed.error });
      io.stderr(`warning: skipped ${entry}: ${analyzed.error}\n`);
      continue;
    }
    scans.push({
      name: entry,
      specs: analyzed.specs,
      findings: analyzed.summary.total,
      errors: analyzed.summary.error,
      warnings: analyzed.summary.warning,
      infos: analyzed.summary.info,
      score: analyzed.score.value,
      grade: analyzed.score.grade,
      coverage: analyzed.coverage,
    });
    io.stderr(
      `note: scanned ${entry} (${analyzed.specs} specs, ${analyzed.summary.total} findings, score ${analyzed.score.value})\n`,
    );
  }
  if (scans.length === 0) {
    io.stderr(`error: no projects with specs found in ${args.dir}\n`);
    return 2;
  }

  const report = aggregateScans(
    scans,
    mapping,
    "apigovscan",
    packageVersion(),
    args.github ?? null,
  );
  report.skipped = [...skipped, ...report.skipped].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  if (args.out !== undefined) {
    const outAbs = resolve(io.cwd, args.out);
    if (existsSync(outAbs) && !args.force) {
      io.stderr(`error: output exists: ${args.out} (pass --force to overwrite)\n`);
      return 2;
    }
    const text =
      args.format === "json"
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatScanConsole(args.dir, report);
    try {
      writeFileSync(outAbs, text, "utf8");
    } catch (err) {
      io.stderr(
        `error: cannot write ${args.out}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
  }
  if (args.format === "json") {
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    io.stdout(formatScanConsole(args.dir, report));
  }
  return 0;
}

export async function run(argv: readonly string[], io?: RunIO): Promise<number> {
  const stdout =
    io?.stdout ??
    ((text: string) => {
      process.stdout.write(text);
    });
  const stderr =
    io?.stderr ??
    ((text: string) => {
      process.stderr.write(text);
    });
  const env = io?.env ?? process.env;
  const cwd = io?.cwd ?? process.cwd();
  const isTTY = io?.isTTY ?? process.stdout.isTTY === true;
  const readStdin =
    io?.stdin ??
    (async () => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of process.stdin) {
        const buf = Buffer.isBuffer(chunk)
          ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          : new Uint8Array(chunk as ArrayBuffer);
        chunks.push(buf);
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    });

  const args = argv.slice(2);

  const first = args[0];
  const isKnownCommand =
    first === "init" ||
    first === "analyze" ||
    first === "rules" ||
    first === "learn" ||
    first === "suppress" ||
    first === "skills" ||
    first === "license" ||
    first === "fix" ||
    first === "drift" ||
    first === "scan-org" ||
    first === "dashboard" ||
    first === "mcp";

  if (
    args.length === 0 ||
    first === "--help" ||
    first === "-h" ||
    (!isKnownCommand && (args.includes("--help") || args.includes("-h")))
  ) {
    stdout(`${getHelp()}\n`);
    return 0;
  }

  if (first === "--version" || first === "-V") {
    stdout(`${getVersion()}\n`);
    return 0;
  }

  if (first === "init") {
    return runInitCommand(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }
  if (first === "analyze") {
    return runAnalyze(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
      isTTY,
      readStdin,
    });
  }
  if (first === "rules") {
    return runRulesCommand(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
    });
  }
  if (first === "learn") {
    return runLearn(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }
  if (first === "suppress") {
    return runSuppressCommand(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }
  if (first === "skills") {
    return runSkillsCommand(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }
  if (first === "license") {
    return runLicenseCommand(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
    });
  }
  if (first === "fix") {
    return runFixCommand(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
      readStdin,
    });
  }
  if (first === "drift") {
    return runDriftCommand(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
    });
  }
  if (first === "scan-org") {
    return runScanOrgCommand(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
    });
  }
  if (first === "diff") {
    return runDiffCommand(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
      isTTY,
    });
  }
  if (first === "dashboard") {
    return runDashboardCommand(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }
  if (first === "mcp") {
    return runMcpCommand(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
    });
  }

  stderr(`Unknown command: ${first}\nRun apigovscan --help\n`);
  return 2;
}
