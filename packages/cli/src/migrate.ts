import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { packageVersion, type Finding } from "@ankaa/core";
import { analyzeUseCase } from "./analyze.js";
import { prepareAnalysis } from "./analyze-setup.js";
import { createFsPackRepository, createFsSpecLoader } from "./loaders.js";
import { loadConfig } from "./config.js";
import { checkLicense, licenseErrorMessage } from "./license.js";
import { resolveLearnSkillsDir } from "./learn.js";
import { SKILLS_SCHEMA_VERSION } from "./skills.js";
import {
  classifySpectralRules,
  resolveSpectralRuleset,
  ruleCountGuard,
  serializeImports,
  validateImports,
} from "./spectral.js";

export type MigrateOrigin = "redocly" | "vacuum";

export interface IgnoreEntry {
  ruleId: string;
  /** Normalized JSON Pointer (no leading #). */
  pointer: string;
  /** Original expression, for messages. */
  rawPath: string;
  /** Redocly only: file key the entry belonged to. */
  fileKey?: string;
}

export interface MigrationSuppression {
  fingerprint: string;
  reason: string;
}

export interface MigrationUnmatched {
  ruleId: string;
  rawPath: string;
  reason: string;
}

export interface MigrationPlan {
  origin: MigrateOrigin;
  destination: string;
  suppressions: MigrationSuppression[];
  unmatched: MigrationUnmatched[];
}

export function parseRedoclyIgnore(
  path: string,
): { ok: true; entries: IgnoreEntry[] } | { ok: false; error: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: `redocly ignore file not found: ${path}` };
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return {
      ok: false,
      error: `redocly ignore ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `redocly ignore ${path}: root must be a mapping (file → ruleId → pointers)` };
  }
  const entries: IgnoreEntry[] = [];
  for (const [fileKey, rules] of Object.entries(raw as Record<string, unknown>)) {
    if (rules === null || typeof rules !== "object" || Array.isArray(rules)) {
      return { ok: false, error: `redocly ignore ${path}: "${fileKey}" must be a mapping (ruleId → pointers)` };
    }
    for (const [ruleId, pointers] of Object.entries(rules as Record<string, unknown>)) {
      if (!Array.isArray(pointers)) {
        return { ok: false, error: `redocly ignore ${path}: "${fileKey}"."${ruleId}" must be a list of pointers` };
      }
      for (const pointer of pointers) {
        if (typeof pointer !== "string" || !pointer.startsWith("#/")) {
          return {
            ok: false,
            error: `redocly ignore ${path}: "${fileKey}"."${ruleId}" entries must be JSON Pointers starting with #/`,
          };
        }
        entries.push({
          ruleId,
          pointer: pointer.slice(1),
          rawPath: pointer,
          fileKey,
        });
      }
    }
  }
  return { ok: true, entries };
}

export function parseVacuumIgnore(
  path: string,
): { ok: true; entries: IgnoreEntry[] } | { ok: false; error: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: `vacuum ignore file not found: ${path}` };
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return {
      ok: false,
      error: `vacuum ignore ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `vacuum ignore ${path}: root must be a mapping (ruleId → paths)` };
  }
  const entries: IgnoreEntry[] = [];
  for (const [ruleId, paths] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(paths)) {
      return { ok: false, error: `vacuum ignore ${path}: "${ruleId}" must be a list of paths` };
    }
    for (const jsonPath of paths) {
      if (typeof jsonPath !== "string") {
        return { ok: false, error: `vacuum ignore ${path}: "${ruleId}" entries must be strings` };
      }
      const converted = jsonPathToPointer(jsonPath);
      if (!converted.ok) {
        entries.push({ ruleId, pointer: "", rawPath: jsonPath });
        continue;
      }
      entries.push({ ruleId, pointer: converted.pointer, rawPath: jsonPath });
    }
  }
  return { ok: true, entries };
}

export function jsonPathToPointer(
  jsonPath: string,
): { ok: true; pointer: string } | { ok: false; error: string } {
  const src = jsonPath.trim();
  if (!src.startsWith("$")) {
    return { ok: false, error: "expected JSONPath rooted at $" };
  }
  if (src.includes("..")) {
    return { ok: false, error: "recursive descent (..) has no JSON Pointer equivalent" };
  }
  const body = src.slice(1);
  for (const ch of ["*", "?", "@", ":", "("]) {
    if (body.includes(ch)) {
      return { ok: false, error: `unsupported JSONPath syntax near "${ch}"` };
    }
  }
  const segments: string[] = [];
  let i = 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ".") {
      i += 1;
      let name = "";
      while (i < src.length && src[i] !== "." && src[i] !== "[") {
        name += src[i];
        i += 1;
      }
      if (name.length === 0) {
        return { ok: false, error: "empty path segment" };
      }
      segments.push(name);
      continue;
    }
    if (ch === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) {
        return { ok: false, error: "unterminated [ in JSONPath" };
      }
      const inner = src.slice(i + 1, end).trim();
      if (/^\d+$/.test(inner)) {
        segments.push(inner);
      } else if (inner.length >= 2 && inner.startsWith("'") && inner.endsWith("'")) {
        segments.push(inner.slice(1, -1));
      } else {
        return { ok: false, error: `unsupported bracket segment [${inner}]` };
      }
      i = end + 1;
      continue;
    }
    return { ok: false, error: `unexpected character "${ch}" at position ${i}` };
  }
  const pointer = `/${segments
    .map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
  return { ok: true, pointer };
}

export function buildMigration(input: {
  findings: Finding[];
  entries: IgnoreEntry[];
  specBasename: string;
  origin: MigrateOrigin;
}): { suppressions: MigrationSuppression[]; unmatched: MigrationUnmatched[] } {
  const suppressions: MigrationSuppression[] = [];
  const unmatched: MigrationUnmatched[] = [];
  const seen = new Set<string>();

  for (const entry of input.entries) {
    if (input.origin === "redocly" && entry.fileKey !== input.specBasename) {
      unmatched.push({
        ruleId: entry.ruleId,
        rawPath: entry.rawPath,
        reason: `file "${entry.fileKey}" does not match spec "${input.specBasename}"`,
      });
      continue;
    }
    if (entry.pointer === "") {
      unmatched.push({
        ruleId: entry.ruleId,
        rawPath: entry.rawPath,
        reason: "JSONPath not convertible to JSON Pointer",
      });
      continue;
    }
    const matches = input.findings.filter((f) => f.location === entry.pointer);
    if (matches.length === 0) {
      unmatched.push({
        ruleId: entry.ruleId,
        rawPath: entry.rawPath,
        reason: `no finding at ${entry.pointer}`,
      });
      continue;
    }
    for (const match of matches) {
      if (seen.has(match.fingerprint)) continue;
      seen.add(match.fingerprint);
      suppressions.push({
        fingerprint: match.fingerprint,
        reason: `migrated from ${input.origin} ignore (rule: ${entry.ruleId})`,
      });
    }
  }

  suppressions.sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0));
  return { suppressions, unmatched };
}

export function serializeMigrated(suppressions: MigrationSuppression[]): string {
  return stringifyYaml({
    version: SKILLS_SCHEMA_VERSION,
    suppressions: suppressions.map((s) => ({ fingerprint: s.fingerprint, reason: s.reason })),
  });
}

const MIGRATE_USAGE = [
  "Usage:",
  "  ankaa migrate --redocly-ignore <.redocly.lint-ignore.yaml> --spec <path>",
  "  ankaa migrate --vacuum-ignore <ignore.yaml> --spec <path>",
  "  ankaa migrate --spectral-rules <ruleset.yaml> [--out <file>] [--force]",
  "               [--skills-dir <dir>] [--dry-run] [--config <f>] [--license-key <k>]",
  "",
  "Import foreign ignore-files as fingerprint suppressions under",
  ".ankaa/skills/migrated/<origin>.yaml (idempotent, offline).",
  "Matching is by location: the foreign ruleId is recorded in the reason,",
  "never interpreted. --spectral-disables is a follow-up (see spec).",
  "--spectral-rules transpiles a Spectral ruleset offline (extends",
  "spectral:oas resolves against the vendored 1.23.0 copy) into a custom",
  "rules draft; out-of-shape rules are skipped with a reason (never silent).",
  "",
].join("\n");

interface MigrateIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  env: Record<string, string | undefined>;
  readStdin?: (signal?: AbortSignal) => Promise<Uint8Array>;
}

export async function runMigrateCommand(argv: readonly string[], io: MigrateIo): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(MIGRATE_USAGE);
    return 0;
  }
  for (const pending of ["--spectral-disables"]) {
    if (argv.includes(pending)) {
      io.stderr(
        `error: ${pending} is a follow-up (see specs/f17-migration-kit.md § scope); v0 imports redocly/vacuum exceptions and spectral rules\n`,
      );
      return 2;
    }
  }

  let redoclyPath: string | undefined;
  let vacuumPath: string | undefined;
  let spectralPath: string | undefined;
  let outPath: string | undefined;
  let force = false;
  let specPath: string | undefined;
  let skillsDirFlag: string | undefined;
  let configPath: string | undefined;
  let licenseKey: string | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--force") {
      force = true;
      continue;
    }
    if (
      token === "--redocly-ignore" ||
      token === "--vacuum-ignore" ||
      token === "--spectral-rules" ||
      token === "--out" ||
      token === "--spec" ||
      token === "--skills-dir" ||
      token === "--config" ||
      token === "--license-key"
    ) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr(`error: ${token} requires a value\n`);
        return 2;
      }
      if (token === "--redocly-ignore") redoclyPath = v;
      else if (token === "--vacuum-ignore") vacuumPath = v;
      else if (token === "--spectral-rules") spectralPath = v;
      else if (token === "--out") outPath = v;
      else if (token === "--spec") specPath = v;
      else if (token === "--skills-dir") skillsDirFlag = v;
      else if (token === "--config") configPath = v;
      else licenseKey = v;
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

  if (spectralPath !== undefined) {
    return runSpectralRulesImport(spectralPath, { outPath, force, dryRun }, io);
  }

  if ((redoclyPath !== undefined ? 1 : 0) + (vacuumPath !== undefined ? 1 : 0) !== 1) {
    io.stderr("error: migrate requires exactly one of --redocly-ignore | --vacuum-ignore | --spectral-rules\n");
    return 2;
  }
  if (specPath === undefined) {
    io.stderr("error: migrate requires --spec <file>\n");
    return 2;
  }

  const origin: MigrateOrigin = redoclyPath !== undefined ? "redocly" : "vacuum";
  const ignoreAbs = resolve(io.cwd, redoclyPath ?? vacuumPath!);
  const specAbs = resolve(io.cwd, specPath);
  if (!existsSync(specAbs) || !statSync(specAbs).isFile()) {
    io.stderr(`error: --spec must be an existing file: ${specPath}\n`);
    return 2;
  }

  const configResult = loadConfig(io.cwd, configPath);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const license = checkLicense({
    flag: licenseKey,
    env: io.env.ANKAA_LICENSE_KEY,
    config: configResult.config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const parsed = origin === "redocly" ? parseRedoclyIgnore(ignoreAbs) : parseVacuumIgnore(ignoreAbs);
  if (!parsed.ok) {
    io.stderr(`error: ${parsed.error}\n`);
    return 2;
  }

  const prepared = prepareAnalysis(io.cwd, configResult.config, {
    rulesFiles: [],
    skillsDir: undefined,
    baselineMode: "off",
  });
  if (!prepared.ok) {
    io.stderr(`error: ${prepared.error}\n`);
    return 2;
  }

  const outcome = await analyzeUseCase(
    {
      loader: createFsSpecLoader(io.readStdin),
      packs: createFsPackRepository(io.cwd),
      sink: {
        async write() {},
      },
    },
    {
      inputs: [specAbs],
      labelFor: (p) => p,
      failOn: "never",
      customRules: prepared.setup.customRules,
      disabledRuleIds: prepared.setup.disabledRuleIds,
      severityOverrides: prepared.setup.severityOverrides,
      toolVersion: packageVersion(),
      // Raw findings on purpose: existing skills/baseline must not hide the
      // findings we are trying to fingerprint (idempotency depends on this).
      baselineFingerprints: undefined,
      skillsSuppressions: undefined,
    },
  );
  if (!outcome.ok) {
    io.stderr(`error: ${outcome.error}\n`);
    return outcome.exitCode;
  }

  const plan = buildMigration({
    findings: outcome.report.findings,
    entries: parsed.entries,
    specBasename: basename(specAbs),
    origin,
  });

  const skillsDir = resolveLearnSkillsDir(
    skillsDirFlag,
    configResult.config.skillsDir,
    configResult.config.configDir,
    io.cwd,
  );
  const destination = join(skillsDir, "migrated", `${origin}.yaml`);

  io.stdout(`migrate: ${origin} → ${destination}\n`);
  io.stdout(`  imported: ${plan.suppressions.length} suppression${plan.suppressions.length === 1 ? "" : "s"} (fingerprint-based)\n`);
  io.stdout(`  unmatched: ${plan.unmatched.length}\n`);
  for (const u of plan.unmatched) {
    io.stdout(`    unmatched: ${u.ruleId} ${u.rawPath} — ${u.reason}\n`);
  }

  if (dryRun) {
    io.stdout("dry-run: nothing written\n");
    return 0;
  }

  mkdirSync(join(skillsDir, "migrated"), { recursive: true });
  try {
    writeFileSync(destination, serializeMigrated(plan.suppressions), "utf8");
  } catch (err) {
    io.stderr(
      `error: cannot write ${destination}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  io.stdout(`wrote: ${destination}\n`);
  return 0;
}

async function runSpectralRulesImport(
  spectralPath: string,
  opts: { outPath?: string; force: boolean; dryRun: boolean },
  io: MigrateIo,
): Promise<number> {
  const abs = resolve(io.cwd, spectralPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    io.stderr(`error: ruleset not found or not a file: ${spectralPath}\n`);
    return 2;
  }

  const configResult = loadConfig(io.cwd, undefined);
  const configKey = configResult.ok ? configResult.config.license?.key : undefined;
  const license = checkLicense({
    env: io.env.ANKAA_LICENSE_KEY,
    config: configKey,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const resolved = resolveSpectralRuleset(abs);
  if (!resolved.ok) {
    io.stderr(`error: ${resolved.error}\n`);
    return 2;
  }
  const guard = ruleCountGuard(resolved.rules);
  if (guard !== undefined) {
    io.stderr(`error: ${guard}\n`);
    return 2;
  }

  const classified = classifySpectralRules(resolved.rules);
  const { valid, invalid } = validateImports(classified.imports, packageVersion());
  const destination = resolve(io.cwd, opts.outPath ?? "spectral-imported-rules.yaml");

  io.stdout(`migrate: spectral ruleset → ${destination}\n`);
  io.stdout(`  resolved: ${resolved.rules.size} rules (extends: spectral:oas vendored)\n`);
  io.stdout(`  imported: ${valid.length} (shapes) · covered: ${classified.covered.length} (elite) · skipped: ${classified.skipped.length + invalid.length}\n`);
  for (const entry of classified.covered) {
    io.stdout(`    covered: ${entry.name} → ${entry.equivalent}\n`);
  }
  for (const skip of [...classified.skipped, ...invalid]) {
    io.stdout(`    skipped: ${skip.name} — ${skip.reason}\n`);
  }

  if (valid.length === 0) {
    io.stdout("no transliterable rules: nothing written\n");
    return 0;
  }
  if (opts.dryRun) {
    io.stdout("dry-run: nothing written\n");
    return 0;
  }
  if (existsSync(destination) && !opts.force) {
    io.stderr(`error: ${destination} exists (use --force to overwrite)\n`);
    return 2;
  }
  try {
    writeFileSync(destination, serializeImports(valid), "utf8");
  } catch (err) {
    io.stderr(
      `error: cannot write ${destination}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  io.stdout(`wrote: ${destination}\n`);
  io.stdout("review the draft as code, then pass it to analyze via --rules\n");
  return 0;
}
