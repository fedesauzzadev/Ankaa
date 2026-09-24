import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  explain,
  packageVersion,
  type Rule,
  type Severity,
} from "@apigovscan/core";
import {
  parseAnalyzeArgs,
  parseRulesArgs,
  type FailOn,
} from "./args.js";
import { analyzeUseCase } from "./analyze.js";
import {
  buildBaseline,
  checkInputHashes,
  fingerprintSet,
  loadBaselineFile,
  resolveBaselinePath,
  writeBaselineFile,
  type BaselineFile,
} from "./baseline.js";
import {
  loadConfig,
  resolveCustomRulePaths,
  type AnalyzeConfig,
} from "./config.js";
import { discoverSpecs } from "./discovery.js";
import { formatInitEntries, runInit } from "./init.js";
import {
  collectCustomRules,
  packRuleIds,
  validateRulesFiles,
  type RulesSource,
} from "./custom-rules.js";
import {
  compileMatchRegexes,
  listSkills,
  loadSkills,
  mergeSeverityOverrides,
  promoteDraft,
  resolveSkillsDir,
} from "./skills.js";
import {
  buildLearnPatch,
  loadExistingSeverities,
  loadExistingSuppressions,
  loadFeedbackFile,
  loadReportFile,
  resolveLearnSkillsDir,
  writeLearnPatch,
} from "./learn.js";
import {
  createFsPackRepository,
  createFsSpecLoader,
  createReportSink,
} from "./loaders.js";
import { createCliMcpHandlers } from "./mcp.js";
import { createMcpServer, startStdioServer } from "@apigovscan/mcp";
import {
  defaultPackSearchRoots,
  findElitePackDir,
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
    "  apigovscan learn --report <r.json> --feedback <f.json> [options]",
    "  apigovscan skills list [--format json]",
    "  apigovscan skills promote <draftId>",
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
    "  validate_custom_rules, explain_finding (sandboxed under cwd).",
    '  Client: {"mcpServers":{"apigovscan":{"command":"npx","args":["-y","@apigovscan/cli","mcp"]}}}',
    "",
    "Exit codes:",
    "  0  no findings at or above --fail-on",
    "  1  findings at or above --fail-on",
    "  2  usage / parse / config / rule / baseline / skills / learn / init / mcp error",
    "",
    "Docs: docs/SDD.md · specs/f1-analyze.md · specs/f2-*.md · specs/f3-*.md · specs/f4-mcp-*.md · specs/f5-*.md",
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

function applyConfigRules(
  config: AnalyzeConfig,
): { disabled: Set<string>; overrides: Map<string, Severity> } {
  const disabled = new Set<string>();
  const overrides = new Map<string, Severity>();
  for (const [ruleId, value] of Object.entries(config.rules ?? {})) {
    if (value === "off") {
      disabled.add(ruleId);
    } else {
      overrides.set(ruleId, value);
    }
  }
  return { disabled, overrides };
}

function mergeFailOn(
  flag: FailOn | undefined,
  config: AnalyzeConfig,
  stderr: (t: string) => void,
): FailOn {
  const failOn = flag ?? config.failOn ?? "error";
  if (failOn === "never") {
    stderr(
      "warning: failOn=never always exits 0; use only for exploration, not CI\n",
    );
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

  if (
    config.standards?.version !== undefined &&
    config.standards.version !== "0.0.0-dev"
  ) {
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

  // Load skills (f3): suppressions, severity overrides, active drafts.
  const skillsDir = resolveSkillsDir(config, io.cwd, args.skillsDir);
  const skillsResult = loadSkills(skillsDir, packageVersion());
  if (!skillsResult.ok) {
    io.stderr(`error: ${skillsResult.error}\n`);
    return 2;
  }
  const skills = skillsResult.skills;

  // Severity: config rules > skills severities > pack default.
  const configRuleResult = applyConfigRules(config);
  const severityOverrides = mergeSeverityOverrides(
    skills.severities,
    configRuleResult.overrides,
  );
  const disabled = configRuleResult.disabled;

  let customRules: Rule[] | undefined;
  try {
    const sources: RulesSource[] = [];
    const configRulePaths = resolveCustomRulePaths(config, io.cwd);
    for (const path of configRulePaths) {
      if (!existsSync(path)) {
        io.stderr(
          `error: config customRules not found: ${path}\n`,
        );
        return 2;
      }
      sources.push({ kind: "file", path });
    }
    for (const path of args.rulesFiles) {
      sources.push({ kind: "file", path: resolve(io.cwd, path) });
    }
    if (args.ruleInline !== undefined) {
      sources.push({ kind: "inline", json: args.ruleInline });
    }
    const dir = findElitePackDir(defaultPackSearchRoots(io.cwd));
    const eliteIds = dir
      ? packRuleIds(loadPackFromDir(dir))
      : undefined;
    let collectedRules: Rule[] = [];
    if (sources.length > 0) {
      const collected = collectCustomRules(sources, packageVersion(), {
        eliteRuleIds: eliteIds,
      });
      if (!collected.ok) {
        io.stderr(`error: ${collected.error}\n`);
        return 2;
      }
      collectedRules = collected.rules;
    }
    // Active skill drafts: no id collision with config/--rules custom.
    if (skills.activeDraftRules.length > 0) {
      const seen = new Set(collectedRules.map((r) => r.id));
      for (const draft of skills.activeDraftRules) {
        if (seen.has(draft.id)) {
          io.stderr(
            `error: duplicate rule id ${draft.id} (skills draft and custom rules)\n`,
          );
          return 2;
        }
        if (eliteIds?.has(draft.id) === true) {
          io.stderr(
            `error: rule id ${draft.id} already exists in pack elite; use config rules: overrides or a new id\n`,
          );
          return 2;
        }
        seen.add(draft.id);
        collectedRules.push(draft);
      }
    }
    if (collectedRules.length > 0) {
      customRules = collectedRules;
    }
  } catch (err) {
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  let skillsMatchRegexes: Map<number, RegExp> | undefined;
  if (skills.suppressions.length > 0) {
    const compiled = compileMatchRegexes(skills.suppressions, skillsDir);
    if (!compiled.ok) {
      io.stderr(`error: ${compiled.error}\n`);
      return 2;
    }
    skillsMatchRegexes = compiled.map;
  }

  // Load baseline early (read mode): missing/invalid → exit 2 before analyze
  // Write mode: refuse overwrite before analyze when file exists without --force
  let baselineFingerprints: Set<string> | undefined;
  let loadedBaseline: BaselineFile | undefined;
  if (baselineMode === "read") {
    const loaded = loadBaselineFile(baselinePath);
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    loadedBaseline = loaded.baseline;
    baselineFingerprints = fingerprintSet(loaded.baseline);
  } else if (baselineMode === "write" && existsSync(baselinePath) && !args.force) {
    io.stderr(
      `error: baseline already exists: ${baselinePath} (pass --force to overwrite)\n`,
    );
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

  const noColor =
    args.noColor ||
    (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== "");
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
          output:
            args.output !== undefined
              ? resolve(io.cwd, args.output)
              : undefined,
          stdout: io.stdout,
        }),
    },
    {
      inputs,
      labelFor: (p) => (p === "-" ? "<stdin>" : normalizeLabel(p, io.cwd)),
      failOn,
      customRules,
      disabledRuleIds: disabled,
      severityOverrides,
      toolVersion: packageVersion(),
      debug,
      baselineFingerprints,
      skillsSuppressions:
        skills.suppressions.length > 0 && skillsMatchRegexes !== undefined
          ? {
              suppressions: skills.suppressions,
              matchRegexes: skillsMatchRegexes,
            }
          : undefined,
    },
  );

  if (!outcome.ok) {
    io.stderr(`error: ${outcome.error}\n`);
    return outcome.exitCode;
  }

  // Hash checks after we know report.input labels/sha256
  if (baselineMode === "read" && loadedBaseline !== undefined) {
    const complaints = checkInputHashes(
      loadedBaseline,
      outcome.report.input,
      hashMode,
    );
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

function formatExplain(
  ruleId: string,
  explanation: ReturnType<typeof explain>,
): string {
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
  lines.push(
    "",
    `pack: ${explanation.packId}@${explanation.packVersion}`,
  );
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
        ...(o.structuralError !== undefined
          ? { error: o.structuralError }
          : {}),
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
      io.stderr(
        `error: invalid custom rule in ${o.file} #${e.index}: ${e.issues.join("; ")}\n`,
      );
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
    const loaded = loadCustomRulesForRulesCmd(
      parsed.args.rulesFiles,
      io.cwd,
      elite,
    );
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    custom = loaded.rules;
  }

  const eliteSorted = [...elite.rules].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const customSorted = [...custom].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

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

  const lines: string[] = [
    `${elite.id}@${elite.version}  ${eliteSorted.length} rules`,
  ];
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
  if (parsed.args.rulesFiles.length > 0) {
    const loaded = loadCustomRulesForRulesCmd(
      parsed.args.rulesFiles,
      io.cwd,
      pack,
    );
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

function runRulesCommand(
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
        "  apigovscan rules validate <file...> [--format json]",
        "  apigovscan rules list [--rules <file>] [--format json]",
        "  apigovscan rules explain <ruleId> [--rules <file>]",
        "",
        "validate  Check custom rule files against the DSL (exit 0/2).",
        "list      List active pack rules (and custom rules when --rules is given).",
        "explain   Print message, fix, source URL, and pack version for a rule.",
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
  io.stderr(
    `error: unknown rules subcommand "${sub ?? ""}" (expected: validate | list | explain)\n`,
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
    io.stderr(
      "warning: feedback reportHash differs from report (proceeding)\n",
    );
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
        io.stderr('error: --format must be console | json\n');
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
      if (s.fingerprint !== undefined) {
        lines.push(`  fp ${s.fingerprint.slice(0, 12)}…  ${s.reason}`);
      } else if (s.match !== undefined) {
        const api = s.match.apiPath !== undefined ? ` apiPath=${s.match.apiPath}` : "";
        lines.push(`  match ${s.match.ruleId}${api}  ${s.reason}`);
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
      io.stderr(
        `error: invalid draft id format "${draftId}" (expected PREFIX-NNN)\n`,
      );
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

  io.stderr(
    `error: unknown skills subcommand "${sub ?? ""}" (expected: list | promote)\n`,
  );
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
    io.stderr(
      `error: mcp server failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
}

export async function run(
  argv: readonly string[],
  io?: RunIO,
): Promise<number> {
  const stdout = io?.stdout ?? ((text: string) => { process.stdout.write(text); });
  const stderr = io?.stderr ?? ((text: string) => { process.stderr.write(text); });
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
    first === "skills" ||
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
  if (first === "skills") {
    return runSkillsCommand(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }
  if (first === "mcp") {
    return runMcpCommand(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }

  stderr(`Unknown command: ${first}\nRun apigovscan --help\n`);
  return 2;
}
