import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { packageVersion, type Rule, type Severity } from "@apigovscan/core";
import {
  type AnalyzeConfig,
  resolveCustomRulePaths,
} from "./config.js";
import {
  collectCustomRules,
  packRuleIds,
  type RulesSource,
} from "./custom-rules.js";
import {
  compileMatchRegexes,
  loadSkills,
  mergeSeverityOverrides,
  resolveSkillsDir,
  type SuppressionEntry,
} from "./skills.js";
import {
  fingerprintSet,
  loadBaselineFile,
  resolveBaselinePath,
  type BaselineFile,
} from "./baseline.js";
import {
  defaultPackSearchRoots,
  findElitePackDir,
  loadPackFromDir,
} from "./pack-fs.js";

export interface AnalysisFlags {
  rulesFiles: string[];
  ruleInline?: string;
  skillsDir?: string;
  baselinePath?: string;
  baselineMode: "read" | "off";
}

export interface AnalysisSetup {
  customRules?: Rule[];
  disabledRuleIds: Set<string>;
  severityOverrides: Map<string, Severity>;
  skillsSuppressions?: {
    suppressions: readonly SuppressionEntry[];
    matchRegexes: ReadonlyMap<number, RegExp>;
  };
  baselineFingerprints?: Set<string>;
  loadedBaseline?: BaselineFile;
  skillsDir: string;
  lookupRules: readonly Rule[];
}

function applyConfigRules(config: AnalyzeConfig): {
  disabled: Set<string>;
  overrides: Map<string, Severity>;
} {
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

export function prepareAnalysis(
  cwd: string,
  config: AnalyzeConfig,
  flags: AnalysisFlags,
): { ok: true; setup: AnalysisSetup } | { ok: false; error: string } {
  const skillsDir = resolveSkillsDir(config, cwd, flags.skillsDir);
  const skillsResult = loadSkills(skillsDir, packageVersion());
  if (!skillsResult.ok) {
    return { ok: false, error: skillsResult.error };
  }
  const skills = skillsResult.skills;

  const configRuleResult = applyConfigRules(config);
  const severityOverrides = mergeSeverityOverrides(
    skills.severities,
    configRuleResult.overrides,
  );
  const disabled = configRuleResult.disabled;

  let customRules: Rule[] | undefined;
  let lookupRules: Rule[] = [];
  try {
    const sources: RulesSource[] = [];
    const configRulePaths = resolveCustomRulePaths(config, cwd);
    for (const path of configRulePaths) {
      if (!existsSync(path)) {
        return { ok: false, error: `config customRules not found: ${path}` };
      }
      sources.push({ kind: "file", path });
    }
    for (const path of flags.rulesFiles) {
      sources.push({ kind: "file", path: resolve(cwd, path) });
    }
    if (flags.ruleInline !== undefined) {
      sources.push({ kind: "inline", json: flags.ruleInline });
    }
    const dir = findElitePackDir(defaultPackSearchRoots(cwd));
    const elitePack = dir !== null ? loadPackFromDir(dir) : undefined;
    const eliteIds =
      elitePack !== undefined ? packRuleIds(elitePack) : undefined;
    const collectedRules: Rule[] = [];
    if (sources.length > 0) {
      const collected = collectCustomRules(sources, packageVersion(), {
        eliteRuleIds: eliteIds,
      });
      if (!collected.ok) {
        return { ok: false, error: collected.error };
      }
      collectedRules.push(...collected.rules);
    }
    // Active skill drafts: no id collision with config/--rules custom.
    const seen = new Set(collectedRules.map((r) => r.id));
    for (const draft of skills.activeDraftRules) {
      if (seen.has(draft.id)) {
        return {
          ok: false,
          error: `duplicate rule id ${draft.id} (skills draft and custom rules)`,
        };
      }
      if (eliteIds?.has(draft.id) === true) {
        return {
          ok: false,
          error: `rule id ${draft.id} already exists in pack elite; use config rules: overrides or a new id`,
        };
      }
      seen.add(draft.id);
      collectedRules.push(draft);
    }
    if (collectedRules.length > 0) {
      customRules = collectedRules;
    }
    lookupRules = [...(elitePack?.rules ?? []), ...collectedRules];
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let skillsMatchRegexes: Map<number, RegExp> | undefined;
  if (skills.suppressions.length > 0) {
    const compiled = compileMatchRegexes(skills.suppressions, skillsDir);
    if (!compiled.ok) {
      return { ok: false, error: compiled.error };
    }
    skillsMatchRegexes = compiled.map;
  }

  let baselineFingerprints: Set<string> | undefined;
  let loadedBaseline: BaselineFile | undefined;
  if (flags.baselineMode === "read") {
    const baselinePath = resolveBaselinePath(
      flags.baselinePath,
      config.baseline?.path,
      config.configDir,
      cwd,
    );
    const loaded = loadBaselineFile(baselinePath);
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }
    loadedBaseline = loaded.baseline;
    baselineFingerprints = fingerprintSet(loaded.baseline);
  }

  const setup: AnalysisSetup = {
    disabledRuleIds: disabled,
    severityOverrides,
    skillsDir,
    lookupRules,
  };
  if (customRules !== undefined) {
    setup.customRules = customRules;
  }
  if (
    skills.suppressions.length > 0 &&
    skillsMatchRegexes !== undefined
  ) {
    setup.skillsSuppressions = {
      suppressions: skills.suppressions,
      matchRegexes: skillsMatchRegexes,
    };
  }
  if (baselineFingerprints !== undefined) {
    setup.baselineFingerprints = baselineFingerprints;
  }
  if (loadedBaseline !== undefined) {
    setup.loadedBaseline = loadedBaseline;
  }
  return { ok: true, setup };
}
