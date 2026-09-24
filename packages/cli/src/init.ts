import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AnalyzeConfig } from "./config.js";
import { DEFAULT_SKILLS_DIR, SKILLS_SCHEMA_VERSION } from "./skills.js";

export interface InitOptions {
  force: boolean;
  skillsDirFlag?: string;
  config: AnalyzeConfig;
}

export type InitAction = "created" | "skipped" | "overwritten";

export interface InitEntry {
  path: string;
  action: InitAction;
}

export interface InitResult {
  ok: true;
  entries: InitEntry[];
  skillsDir: string;
}

export type InitError = { ok: false; error: string };

const CONFIG_SCAFFOLD = [
  "failOn: error",
  "standards:",
  "  pack: elite",
  "skillsDir: .apigovscan/skills",
  "baseline:",
  "  enabled: false",
  "  path: .apigovscan/baseline.json",
  "",
].join("\n");

const SUPPRESSIONS_SCAFFOLD = [
  `version: ${SKILLS_SCHEMA_VERSION}`,
  "suppressions: []",
  "",
].join("\n");

const SEVERITIES_SCAFFOLD = [
  `version: ${SKILLS_SCHEMA_VERSION}`,
  "overrides: []",
  "",
].join("\n");

const SKILLS_README = [
  "# ApiGovScan skills",
  "",
  "Local feedback loop (INV-5: idempotent learn):",
  "",
  "1. `apigovscan analyze <spec> --format json --output report.json`",
  "2. Edit `feedback.json` items: `false_positive` | `wontfix` | `severity_change` | `confirm` | `suggest_rule`",
  "3. `apigovscan learn --report report.json --feedback feedback.json`",
  "4. Review diff, commit, re-run analyze",
  "",
  "- Fingerprint suppressions live in `suppressions.yaml` (reason required).",
  "- Severity overrides live in `severities.yaml`.",
  "- Draft rules in `drafts/` stay inactive until `apigovscan skills promote <PREFIX-NNN>`.",
  "",
].join("\n");

const CONFIG_KEY = "apigovscan.yaml";
const SUPPRESSIONS_KEY = "suppressions.yaml";
const SEVERITIES_KEY = "severities.yaml";
const SKILLS_README_KEY = "README.md";

function resolveInitSkillsDir(
  options: InitOptions,
  cwd: string,
): string {
  if (options.skillsDirFlag !== undefined) {
    return isAbsolute(options.skillsDirFlag)
      ? options.skillsDirFlag
      : resolve(cwd, options.skillsDirFlag);
  }
  const raw = options.config.skillsDir ?? DEFAULT_SKILLS_DIR;
  if (isAbsolute(raw)) return raw;
  const base =
    options.skillsDirFlag === undefined && options.config.skillsDir !== undefined
      ? (options.config.configDir ?? cwd)
      : cwd;
  return resolve(base, raw);
}

function isScaffoldContent(
  path: string,
  scaffold: string,
): boolean {
  try {
    return readFileSync(path, "utf8") === scaffold;
  } catch {
    return false;
  }
}

function isEmptySkillsArrayFile(path: string, key: string): boolean {
  try {
    const raw = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== "object") return false;
    const value = raw[key];
    return (
      raw.version === SKILLS_SCHEMA_VERSION &&
      Array.isArray(value) &&
      value.length === 0
    );
  } catch {
    return false;
  }
}

function writeOrSkip(
  absPath: string,
  content: string,
  force: boolean,
  options: {
    isConfig?: boolean;
    isEmptySkills?: boolean;
    alwaysForce?: boolean;
  },
): InitEntry {
  if (!existsSync(absPath)) {
    writeFileSync(absPath, content, "utf8");
    return { path: absPath, action: "created" };
  }
  if (!force) {
    return { path: absPath, action: "skipped" };
  }
  if (options.alwaysForce === true) {
    writeFileSync(absPath, content, "utf8");
    return { path: absPath, action: "overwritten" };
  }
  if (options.isConfig === true) {
    if (isScaffoldContent(absPath, content)) {
      writeFileSync(absPath, content, "utf8");
      return { path: absPath, action: "overwritten" };
    }
    return { path: absPath, action: "skipped" };
  }
  if (options.isEmptySkills === true) {
    const key = absPath.endsWith("severities.yaml") ? "overrides" : "suppressions";
    if (isEmptySkillsArrayFile(absPath, key)) {
      writeFileSync(absPath, content, "utf8");
      return { path: absPath, action: "overwritten" };
    }
    return { path: absPath, action: "skipped" };
  }
  writeFileSync(absPath, content, "utf8");
  return { path: absPath, action: "overwritten" };
}

export function runInit(cwd: string, options: InitOptions): InitResult | InitError {
  const skillsDir = resolveInitSkillsDir(options, cwd);
  const configPath = join(cwd, CONFIG_KEY);

  try {
    mkdirSync(skillsDir, { recursive: true });
    const draftsDir = join(skillsDir, "drafts");
    mkdirSync(draftsDir, { recursive: true });

    const entries: InitEntry[] = [];

    entries.push(
      writeOrSkip(configPath, CONFIG_SCAFFOLD, options.force, { isConfig: true }),
    );
    entries.push(
      writeOrSkip(
        join(skillsDir, SUPPRESSIONS_KEY),
        SUPPRESSIONS_SCAFFOLD,
        options.force,
        { isEmptySkills: true },
      ),
    );
    entries.push(
      writeOrSkip(
        join(skillsDir, SEVERITIES_KEY),
        SEVERITIES_SCAFFOLD,
        options.force,
        { isEmptySkills: true },
      ),
    );
    const gitkeep = join(draftsDir, ".gitkeep");
    if (!existsSync(gitkeep)) {
      writeFileSync(gitkeep, "", "utf8");
      entries.push({ path: gitkeep, action: "created" });
    } else {
      entries.push({ path: gitkeep, action: "skipped" });
    }
    entries.push(
      writeOrSkip(
        join(skillsDir, SKILLS_README_KEY),
        SKILLS_README,
        options.force,
        { alwaysForce: true },
      ),
    );

    return { ok: true, entries, skillsDir };
  } catch (err) {
    return {
      ok: false,
      error: `init failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function formatInitEntries(
  entries: readonly InitEntry[],
  cwd: string,
): string[] {
  return entries.map((e) => {
    const rel = e.path.startsWith(cwd)
      ? e.path.slice(cwd.length).replace(/^[\\/]/, "").split("\\").join("/")
      : e.path.split("\\").join("/");
    if (e.action === "created") return `created: ${rel}`;
    if (e.action === "overwritten") return `overwritten: ${rel}`;
    return `ok: already present: ${rel}`;
  });
}
