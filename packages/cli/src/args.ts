export type FailOn = "error" | "warning" | "info" | "never";
export type OutputFormat = "console" | "json";

export interface AnalyzeArgs {
  path: string;
  format: OutputFormat;
  output?: string;
  failOn?: FailOn;
  rulesFiles: string[];
  ruleInline?: string;
  noColor: boolean;
  debug: boolean;
  config?: string;
  writeBaseline: boolean;
  baseline: boolean;
  baselinePath?: string;
  force: boolean;
  strictHash: boolean;
  baselineIgnoreHash: boolean;
}

export type ParseArgsResult =
  | { ok: true; args: AnalyzeArgs }
  | { ok: false; error: string };

const FORMATS = new Set<OutputFormat>(["console", "json"]);
const FAIL_ON = new Set<FailOn>(["error", "warning", "info", "never"]);

function isFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

export function parseAnalyzeArgs(argv: readonly string[]): ParseArgsResult {
  const args: AnalyzeArgs = {
    path: "",
    format: "console",
    noColor: false,
    debug: false,
    rulesFiles: [],
    writeBaseline: false,
    baseline: false,
    force: false,
    strictHash: false,
    baselineIgnoreHash: false,
  };
  let pathSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--format") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--format requires a value (console | json)" };
      }
      if (!FORMATS.has(value as OutputFormat)) {
        return {
          ok: false,
          error: `invalid --format "${value}" (expected console | json)`,
        };
      }
      args.format = value as OutputFormat;
      continue;
    }

    if (token === "--output") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--output requires a file path" };
      }
      args.output = value;
      continue;
    }

    if (token === "--fail-on") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return {
          ok: false,
          error: "--fail-on requires a value (error | warning | info | never)",
        };
      }
      if (!FAIL_ON.has(value as FailOn)) {
        return {
          ok: false,
          error: `invalid --fail-on "${value}" (expected error | warning | info | never)`,
        };
      }
      args.failOn = value as FailOn;
      continue;
    }

    if (token === "--rules") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--rules requires a file path" };
      }
      args.rulesFiles.push(value);
      continue;
    }

    if (token === "--rule") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--rule requires a JSON object" };
      }
      args.ruleInline = value;
      continue;
    }

    if (token === "--config") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--config requires a file path" };
      }
      args.config = value;
      continue;
    }

    if (token === "--write-baseline") {
      args.writeBaseline = true;
      continue;
    }

    if (token === "--baseline") {
      args.baseline = true;
      continue;
    }

    if (token === "--baseline-path") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--baseline-path requires a file path" };
      }
      args.baselinePath = value;
      continue;
    }

    if (token === "--force") {
      args.force = true;
      continue;
    }

    if (token === "--strict-hash") {
      args.strictHash = true;
      continue;
    }

    if (token === "--baseline-ignore-hash") {
      args.baselineIgnoreHash = true;
      continue;
    }

    if (token === "--no-color") {
      args.noColor = true;
      continue;
    }

    if (token === "--debug") {
      args.debug = true;
      continue;
    }

    if (token === "--help" || token === "-h" || token === "--version" || token === "-V") {
      return { ok: false, error: `unexpected ${token} after analyze` };
    }

    if (isFlag(token)) {
      return { ok: false, error: `unknown option: ${token}` };
    }

    if (pathSeen) {
      return { ok: false, error: `unexpected argument: ${token}` };
    }
    args.path = token;
    pathSeen = true;
  }

  if (!pathSeen) {
    return {
      ok: false,
      error: "missing required argument <path> (file, directory, or '-' for stdin)",
    };
  }

  if (args.writeBaseline && args.baseline) {
    return {
      ok: false,
      error: "--write-baseline and --baseline are mutually exclusive",
    };
  }

  if (args.strictHash && args.baselineIgnoreHash) {
    return {
      ok: false,
      error: "--strict-hash and --baseline-ignore-hash are mutually exclusive",
    };
  }

  return { ok: true, args };
}

export interface RulesCommonArgs {
  format: OutputFormat;
  rulesFiles: string[];
}

export type ParseRulesArgsResult =
  | { ok: true; args: RulesCommonArgs; rest: string[] }
  | { ok: false; error: string };

export function parseRulesArgs(argv: readonly string[]): ParseRulesArgsResult {
  const args: RulesCommonArgs = { format: "console", rulesFiles: [] };
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--format") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--format requires a value (console | json)" };
      }
      if (!FORMATS.has(value as OutputFormat)) {
        return {
          ok: false,
          error: `invalid --format "${value}" (expected console | json)`,
        };
      }
      args.format = value as OutputFormat;
      continue;
    }

    if (token === "--rules") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--rules requires a file path" };
      }
      args.rulesFiles.push(value);
      continue;
    }

    if (token === "--help" || token === "-h") {
      return { ok: false, error: `unexpected ${token}` };
    }

    if (isFlag(token)) {
      return { ok: false, error: `unknown option: ${token}` };
    }

    rest.push(token);
  }

  return { ok: true, args, rest };
}
