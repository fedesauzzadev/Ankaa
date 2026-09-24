import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  explain,
  packageVersion,
  validateRule,
  type Rule,
  type Severity,
} from "@apigovscan/core";
import { parseAnalyzeArgs, type FailOn } from "./args.js";
import { analyzeUseCase } from "./analyze.js";
import { loadConfig, type AnalyzeConfig } from "./config.js";
import { discoverSpecs } from "./discovery.js";
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
    "  apigovscan rules explain <ruleId>",
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
    "  --rules <file>    YAML/JSON custom rules (added to pack)",
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
    "  2  usage / parse / config error",
    "",
    "Docs: docs/SDD.md · specs/f1-analyze.md",
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

function stampCustomRules(raw: unknown[], toolVersion: string): Rule[] {
  return raw.map((entry, index) => {
    const stamped =
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? {
            ...(entry as Record<string, unknown>),
            packId: "custom",
            packVersion: toolVersion,
          }
        : entry;
    const result = validateRule(stamped);
    if (!result.ok) {
      throw new Error(
        `invalid custom rule #${index + 1}: ${result.issues.join("; ")}`,
      );
    }
    return result.rule;
  });
}

function loadRulesFile(path: string): unknown[] {
  const text = readFileSync(path, "utf8");
  let parsed: unknown;
  if (path.endsWith(".json")) {
    parsed = JSON.parse(text);
  } else {
    parsed = parseYaml(text);
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.rules)) return obj.rules;
    if (typeof obj.id === "string") return [obj];
  }
  throw new Error(`rules file ${path}: expected an array of rules or { rules: [...] }`);
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
    const raw: unknown[] = [];
    if (args.rulesFile !== undefined) {
      raw.push(...loadRulesFile(args.rulesFile));
    }
    if (args.ruleInline !== undefined) {
      let inline: unknown;
      try {
        inline = JSON.parse(args.ruleInline);
      } catch (err) {
        throw new Error(
          `--rule is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      raw.push(inline);
    }
    if (raw.length > 0) {
      customRules = stampCustomRules(raw, packageVersion());
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

function runRules(argv: readonly string[], io: {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
}): number {
  const sub = argv[0];
  if (sub !== "explain") {
    io.stderr(`error: unknown rules subcommand "${sub ?? ""}" (expected: explain)\n`);
    return 2;
  }
  const ruleId = argv[1];
  if (ruleId === undefined || argv.length > 2) {
    io.stderr("error: rules explain requires exactly one <ruleId>\n");
    return 2;
  }
  if (!/^[A-Z][A-Z0-9]*-\d{3}$/.test(ruleId)) {
    io.stderr(`error: invalid rule id format "${ruleId}" (expected PREFIX-NNN)\n`);
    return 2;
  }

  let pack;
  try {
    const dir = findElitePackDir(defaultPackSearchRoots(io.cwd));
    if (!dir) {
      throw new Error(
        "elite pack not found (searched for packs/elite/pack.yaml from cwd and CLI install)",
      );
    }
    pack = loadPackFromDir(dir);
  } catch (err) {
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const explanation = explain(pack, ruleId);
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
        "Usage: apigovscan rules explain <ruleId>",
        "",
        "Prints message, fix, source URL, and pack version for a rule.",
        "",
      ].join("\n"),
    );
    return 0;
  }
  return runRules(argv, io);
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
