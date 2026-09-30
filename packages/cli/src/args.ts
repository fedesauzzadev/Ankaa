export type FailOn = "error" | "warning" | "info" | "never";
export type OutputFormat = "console" | "json" | "sarif" | "markdown" | "annotations";

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
  skillsDir?: string;
  licenseKey?: string;
}

export type ParseArgsResult = { ok: true; args: AnalyzeArgs } | { ok: false; error: string };

const ANALYZE_FORMATS = new Set<OutputFormat>([
  "console",
  "json",
  "sarif",
  "markdown",
  "annotations",
]);
const RULES_FORMATS = new Set<OutputFormat>(["console", "json"]);
const ANALYZE_FORMAT_LIST = "console | json | sarif | markdown | annotations";
const RULES_FORMAT_LIST = "console | json";
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
        return {
          ok: false,
          error: `--format requires a value (${ANALYZE_FORMAT_LIST})`,
        };
      }
      if (!ANALYZE_FORMATS.has(value as OutputFormat)) {
        return {
          ok: false,
          error: `invalid --format "${value}" (expected ${ANALYZE_FORMAT_LIST})`,
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

    if (token === "--skills-dir") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--skills-dir requires a directory path" };
      }
      args.skillsDir = value;
      continue;
    }

    if (token === "--license-key") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--license-key requires a value" };
      }
      args.licenseKey = value;
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
  { ok: true; args: RulesCommonArgs; rest: string[] } | { ok: false; error: string };

export function parseRulesArgs(argv: readonly string[]): ParseRulesArgsResult {
  const args: RulesCommonArgs = { format: "console", rulesFiles: [] };
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--format") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return {
          ok: false,
          error: `--format requires a value (${RULES_FORMAT_LIST})`,
        };
      }
      if (!RULES_FORMATS.has(value as OutputFormat)) {
        return {
          ok: false,
          error: `invalid --format "${value}" (expected ${RULES_FORMAT_LIST})`,
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

export interface FixArgs {
  path: string;
  fingerprint?: string;
  config?: string;
  licenseKey?: string;
}

export type ParseFixArgsResult = { ok: true; args: FixArgs } | { ok: false; error: string };

export function parseFixArgs(argv: readonly string[]): ParseFixArgsResult {
  const args: FixArgs = { path: "" };
  let pathSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--fingerprint") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--fingerprint requires a fingerprint value" };
      }
      args.fingerprint = value;
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

    if (token === "--license-key") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--license-key requires a value" };
      }
      args.licenseKey = value;
      continue;
    }

    if (token === "--help" || token === "-h" || token === "--version" || token === "-V") {
      return { ok: false, error: `unexpected ${token} after fix` };
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
      error: "missing required argument <path> (file or directory)",
    };
  }

  return { ok: true, args };
}

export type SuppressDecision = "false_positive" | "wontfix" | "severity_change";

const SUPPRESS_DECISIONS = new Set<SuppressDecision>([
  "false_positive",
  "wontfix",
  "severity_change",
]);

export interface SuppressArgs {
  report?: string;
  fingerprint?: string;
  decision?: SuppressDecision;
  severity?: "error" | "warning" | "info";
  reason?: string;
  expires?: string;
  owner?: string;
  skillsDir?: string;
  config?: string;
  dryRun: boolean;
}

export type ParseSuppressArgsResult =
  | { ok: true; args: SuppressArgs }
  | { ok: false; error: string };

function takeValue(
  argv: readonly string[],
  i: number,
  flag: string,
): { ok: true; value: string; next: number } | { ok: false; error: string } {
  const value = argv[i + 1];
  if (value === undefined || isFlag(value)) {
    return { ok: false, error: `${flag} requires a value` };
  }
  return { ok: true, value, next: i + 1 };
}

export function parseSuppressArgs(argv: readonly string[]): ParseSuppressArgsResult {
  const args: SuppressArgs = { dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--report" || token === "--fingerprint" || token === "--decision" ||
        token === "--severity" || token === "--reason" || token === "--expires" ||
        token === "--owner" || token === "--skills-dir" ||
        token === "--config") {
      const taken = takeValue(argv, i, token);
      if (!taken.ok) return taken;
      i = taken.next;
      if (token === "--report") args.report = taken.value;
      else if (token === "--fingerprint") args.fingerprint = taken.value;
      else if (token === "--decision") {
        if (!SUPPRESS_DECISIONS.has(taken.value as SuppressDecision)) {
          return {
            ok: false,
            error: "--decision must be false_positive | wontfix | severity_change",
          };
        }
        args.decision = taken.value as SuppressDecision;
      } else if (token === "--severity") {
        if (taken.value !== "error" && taken.value !== "warning" && taken.value !== "info") {
          return { ok: false, error: "--severity must be error | warning | info" };
        }
        args.severity = taken.value;
      }
      else if (token === "--reason") args.reason = taken.value;
      else if (token === "--expires") args.expires = taken.value;
      else if (token === "--owner") args.owner = taken.value;
      else if (token === "--skills-dir") args.skillsDir = taken.value;
      else args.config = taken.value;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--help" || token === "-h" || token === "--version" || token === "-V") {
      return { ok: false, error: `unexpected ${token} after suppress` };
    }

    if (isFlag(token)) {
      return { ok: false, error: `unknown option: ${token}` };
    }

    return { ok: false, error: `unexpected argument: ${token}` };
  }

  if (args.report === undefined) {
    return { ok: false, error: "missing required option --report <r.json>" };
  }
  if (args.fingerprint === undefined) {
    return { ok: false, error: "missing required option --fingerprint <fp>" };
  }
  if (args.decision === undefined) {
    return {
      ok: false,
      error: "missing required option --decision false_positive|wontfix|severity_change",
    };
  }
  if (args.decision === "severity_change" && args.severity === undefined) {
    return { ok: false, error: "--decision severity_change requires --severity <level>" };
  }
  if (args.decision !== "severity_change" && args.severity !== undefined) {
    return { ok: false, error: "--severity only applies to --decision severity_change" };
  }
  return { ok: true, args };
}

export type DriftFormat = "console" | "json";

export interface DriftArgs {
  dir: string;
  spec?: string;
  out?: string;
  format: DriftFormat;
  config?: string;
  licenseKey?: string;
  force: boolean;
}

export type ParseDriftArgsResult = { ok: true; args: DriftArgs } | { ok: false; error: string };

const DRIFT_FORMATS = new Set<DriftFormat>(["console", "json"]);
const DRIFT_FORMAT_LIST = "console | json";

export function parseDriftArgs(argv: readonly string[]): ParseDriftArgsResult {
  const args: DriftArgs = { dir: "", format: "console", force: false };
  let dirSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--spec") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--spec requires a file path" };
      }
      args.spec = value;
      continue;
    }

    if (token === "--out") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--out requires a file path" };
      }
      args.out = value;
      continue;
    }

    if (token === "--format") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return {
          ok: false,
          error: `--format requires a value (${DRIFT_FORMAT_LIST})`,
        };
      }
      if (!DRIFT_FORMATS.has(value as DriftFormat)) {
        return {
          ok: false,
          error: `invalid --format "${value}" (expected ${DRIFT_FORMAT_LIST})`,
        };
      }
      args.format = value as DriftFormat;
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

    if (token === "--license-key") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--license-key requires a value" };
      }
      args.licenseKey = value;
      continue;
    }

    if (token === "--force") {
      args.force = true;
      continue;
    }

    if (token === "--help" || token === "-h" || token === "--version" || token === "-V") {
      return { ok: false, error: `unexpected ${token} after drift` };
    }

    if (isFlag(token)) {
      return { ok: false, error: `unknown option: ${token}` };
    }

    if (dirSeen) {
      return { ok: false, error: `unexpected argument: ${token}` };
    }
    args.dir = token;
    dirSeen = true;
  }

  if (!dirSeen) {
    return {
      ok: false,
      error: "missing required argument <dir> (project directory)",
    };
  }

  return { ok: true, args };
}

export type ScanOrgFormat = "console" | "json";

export interface ScanOrgArgs {
  dir: string;
  github?: string;
  groupBy?: string;
  format: ScanOrgFormat;
  out?: string;
  config?: string;
  licenseKey?: string;
  force: boolean;
  maxRepos: number;
  workdir?: string;
  apiBase: string;
}

export type ParseScanOrgArgsResult = { ok: true; args: ScanOrgArgs } | { ok: false; error: string };

const SCAN_ORG_FORMATS = new Set<ScanOrgFormat>(["console", "json"]);
const SCAN_ORG_FORMAT_LIST = "console | json";
const DEFAULT_MAX_REPOS = 100;
const DEFAULT_API_BASE = "https://api.github.com";

function parsePositiveInt(
  value: string,
  flag: string,
): { ok: true; n: number } | { ok: false; error: string } {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return { ok: false, error: `${flag} requires a positive integer` };
  }
  return { ok: true, n: Number(value) };
}

export function parseScanOrgArgs(argv: readonly string[]): ParseScanOrgArgsResult {
  const args: ScanOrgArgs = {
    dir: "",
    format: "console",
    force: false,
    maxRepos: DEFAULT_MAX_REPOS,
    apiBase: DEFAULT_API_BASE,
  };
  let dirSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--github") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--github requires an organization name" };
      }
      args.github = value;
      continue;
    }

    if (token === "--group-by") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--group-by requires a file path" };
      }
      args.groupBy = value;
      continue;
    }

    if (token === "--format") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return {
          ok: false,
          error: `--format requires a value (${SCAN_ORG_FORMAT_LIST})`,
        };
      }
      if (!SCAN_ORG_FORMATS.has(value as ScanOrgFormat)) {
        return {
          ok: false,
          error: `invalid --format "${value}" (expected ${SCAN_ORG_FORMAT_LIST})`,
        };
      }
      args.format = value as ScanOrgFormat;
      continue;
    }

    if (token === "--out") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--out requires a file path" };
      }
      args.out = value;
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

    if (token === "--license-key") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--license-key requires a value" };
      }
      args.licenseKey = value;
      continue;
    }

    if (token === "--force") {
      args.force = true;
      continue;
    }

    if (token === "--max-repos") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--max-repos requires a value" };
      }
      const parsed = parsePositiveInt(value, "--max-repos");
      if (!parsed.ok) {
        return parsed;
      }
      args.maxRepos = parsed.n;
      continue;
    }

    if (token === "--workdir") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--workdir requires a directory path" };
      }
      args.workdir = value;
      continue;
    }

    if (token === "--api-base") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--api-base requires a URL" };
      }
      args.apiBase = value;
      continue;
    }

    if (token === "--no-color") {
      continue;
    }

    if (token === "--help" || token === "-h" || token === "--version" || token === "-V") {
      return { ok: false, error: `unexpected ${token} after scan-org` };
    }

    if (isFlag(token)) {
      return { ok: false, error: `unknown option: ${token}` };
    }

    if (dirSeen) {
      return { ok: false, error: `unexpected argument: ${token}` };
    }
    args.dir = token;
    dirSeen = true;
  }

  if (!dirSeen) {
    return {
      ok: false,
      error: "missing required argument <dir> (scan root directory)",
    };
  }

  return { ok: true, args };
}

export interface DashboardArgs {
  report: string;
  port: number;
  tracking?: string;
  against?: string;
  groupBy?: string;
}

export type ParseDashboardArgsResult =
  { ok: true; args: DashboardArgs } | { ok: false; error: string };

export function parseDashboardArgs(argv: readonly string[]): ParseDashboardArgsResult {
  const args: DashboardArgs = { report: "", port: 0 };
  let reportSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === "--port") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--port requires a port number (0 for ephemeral)" };
      }
      if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 65535) {
        return { ok: false, error: `--port "${value}" is not a valid port (0-65535)` };
      }
      args.port = Number(value);
      continue;
    }

    if (token === "--tracking") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--tracking requires a file path" };
      }
      args.tracking = value;
      continue;
    }

    if (token === "--against") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--against requires a report path" };
      }
      args.against = value;
      continue;
    }

    if (token === "--group-by") {
      const value = argv[++i];
      if (value === undefined || isFlag(value)) {
        return { ok: false, error: "--group-by requires a file path" };
      }
      args.groupBy = value;
      continue;
    }

    if (token === "--no-color") {
      continue;
    }

    if (token === "--help" || token === "-h" || token === "--version" || token === "-V") {
      return { ok: false, error: `unexpected ${token} after dashboard` };
    }

    if (isFlag(token)) {
      return { ok: false, error: `unknown option: ${token}` };
    }

    if (reportSeen) {
      return { ok: false, error: `unexpected argument: ${token}` };
    }
    args.report = token;
    reportSeen = true;
  }

  if (!reportSeen) {
    return {
      ok: false,
      error: "missing required argument <report.json> (apigovscan report file)",
    };
  }

  return { ok: true, args };
}
