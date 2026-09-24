import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
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
import { loadConfig, type AnalyzeConfig } from "./config.js";
import { discoverSpecs } from "./discovery.js";
import {
  collectCustomRules,
  packRuleIds,
  validateRulesFiles,
  type RulesSource,
} from "./custom-rules.js";
import {
  createFsPackRepository,
  createFsSpecLoader,
  createReportSink,
} from "./loaders.js";
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
    "  apigovscan analyze <path> [options]",
    "  apigovscan rules validate <file...> [options]",
    "  apigovscan rules list [--rules <file>]",
    "  apigovscan rules explain <ruleId> [--rules <file>]",
    "  apigovscan --version",
    "  apigovscan --help",
    "",
    "Arguments:",
    "  path              File, directory, or '-' (stdin)",
    "",
    "Options:",
    "  --format <fmt>    console | json          (default: console)",
    "  --output <file>   write report to file",
    "  --fail-on <sev>   error | warning | info | never   (default: error)",
    "  --rules <file>    YAML/JSON custom rules (repeatable; added to pack)",
    "  --rule <json>     inline rule as JSON",
    "  --config <file>   config file (default: ./apigovscan.yaml)",
    "  --no-color        disable color (also respects NO_COLOR)",
    "  --debug           stage timings to stderr (never spec bodies)",
    "  -h, --help",
    "  -V, --version",
    "",
    "Exit codes:",
    "  0  no findings at or above --fail-on",
    "  1  findings at or above --fail-on",
    "  2  usage / parse / config / rule error",
    "",
    "Docs: docs/SDD.md · specs/f1-analyze.md · specs/f2-custom-rules.md",
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

  let customRules: Rule[] | undefined;
  try {
    const sources: RulesSource[] = [];
    for (const path of args.rulesFiles) {
      sources.push({ kind: "file", path: resolve(io.cwd, path) });
    }
    if (args.ruleInline !== undefined) {
      sources.push({ kind: "inline", json: args.ruleInline });
    }
    if (sources.length > 0) {
      const dir = findElitePackDir(defaultPackSearchRoots(io.cwd));
      const eliteIds = dir
        ? packRuleIds(loadPackFromDir(dir))
        : undefined;
      const collected = collectCustomRules(sources, packageVersion(), {
        eliteRuleIds: eliteIds,
      });
      if (!collected.ok) {
        io.stderr(`error: ${collected.error}\n`);
        return 2;
      }
      if (collected.rules.length > 0) {
        customRules = collected.rules;
      }
    }
  } catch (err) {
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
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

  const { disabled, overrides } = applyConfigRules(config);
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
        output: args.output,
        stdout: io.stdout,
      }),
    },
    {
      inputs,
      labelFor: (p) => (p === "-" ? "<stdin>" : normalizeLabel(p, io.cwd)),
      failOn,
      customRules,
      disabledRuleIds: disabled,
      severityOverrides: overrides,
      toolVersion: packageVersion(),
      debug,
    },
  );

  if (!outcome.ok) {
    io.stderr(`error: ${outcome.error}\n`);
    return outcome.exitCode;
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

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    stdout(`${getHelp()}\n`);
    return 0;
  }

  if (args.includes("--version") || args.includes("-V")) {
    stdout(`${getVersion()}\n`);
    return 0;
  }

  const command = args[0];
  if (command === "analyze") {
    return runAnalyze(args.slice(1), {
      stdout,
      stderr,
      env,
      cwd,
      isTTY,
      readStdin,
    });
  }
  if (command === "rules") {
    return runRulesCommand(args.slice(1), {
      stdout,
      stderr,
      cwd,
    });
  }

  stderr(`Unknown command: ${command}\nRun apigovscan --help\n`);
  return 2;
}
