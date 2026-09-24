import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { validateRule, type Rule, type RulePack } from "@apigovscan/core";

export type RulesSource =
  | { kind: "file"; path: string }
  | { kind: "inline"; json: string };

export type LoadRulesFileResult =
  | { ok: true; rules: unknown[] }
  | { ok: false; error: string };

export function loadRulesFile(path: string): LoadRulesFileResult {
  if (!existsSync(path)) {
    return { ok: false, error: `rules file not found: ${path}` };
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `rules file ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = path.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    return {
      ok: false,
      error: `rules file ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (Array.isArray(parsed)) return { ok: true, rules: parsed };
  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.rules)) return { ok: true, rules: obj.rules };
    if (typeof obj.id === "string") return { ok: true, rules: [obj] };
  }
  return {
    ok: false,
    error: `rules file ${path}: expected an array of rules or { rules: [...] }`,
  };
}

export type StampResult =
  | { ok: true; rules: Rule[] }
  | { ok: false; error: string };

export function stampCustomRules(
  entries: readonly unknown[],
  toolVersion: string,
  origin: string,
): StampResult {
  const rules: Rule[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
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
      return {
        ok: false,
        error: `invalid custom rule in ${origin} #${index + 1}: ${result.issues.join("; ")}`,
      };
    }
    rules.push(result.rule);
  }
  return { ok: true, rules };
}

export type CollectCustomRulesResult =
  | { ok: true; rules: Rule[] }
  | { ok: false; error: string };

export function collectCustomRules(
  sources: readonly RulesSource[],
  toolVersion: string,
  opts?: { eliteRuleIds?: ReadonlySet<string> },
): CollectCustomRulesResult {
  const rules: Rule[] = [];
  const originsById = new Map<string, string>();

  for (const source of sources) {
    let raw: unknown[];
    let origin: string;

    if (source.kind === "file") {
      const loaded = loadRulesFile(source.path);
      if (!loaded.ok) return loaded;
      raw = loaded.rules;
      origin = source.path;
    } else {
      origin = "--rule";
      try {
        raw = [JSON.parse(source.json)];
      } catch (err) {
        return {
          ok: false,
          error: `--rule is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    const stamped = stampCustomRules(raw, toolVersion, origin);
    if (!stamped.ok) return stamped;

    for (const rule of stamped.rules) {
      const prev = originsById.get(rule.id);
      if (prev !== undefined) {
        return {
          ok: false,
          error: `duplicate rule id ${rule.id} (in ${prev} and ${origin})`,
        };
      }
      if (opts?.eliteRuleIds?.has(rule.id) === true) {
        return {
          ok: false,
          error: `rule id ${rule.id} already exists in pack elite; use config rules: overrides or a new id`,
        };
      }
      originsById.set(rule.id, origin);
      rules.push(rule);
    }
  }

  return { ok: true, rules };
}

export type ValidateFileOutcome = {
  file: string;
  ok: boolean;
  ruleCount: number;
  errors: Array<{ index: number; issues: string[] }>;
  structuralError?: string;
};

export function validateRulesFiles(
  paths: readonly string[],
  toolVersion: string,
  cwd: string,
): ValidateFileOutcome[] {
  return paths.map((displayPath) => {
    const abs = resolve(cwd, displayPath);
    const loaded = loadRulesFile(abs);
    if (!loaded.ok) {
      return {
        file: displayPath,
        ok: false,
        ruleCount: 0,
        errors: [],
        structuralError: loaded.error.replace(abs, displayPath),
      };
    }
    const errors: Array<{ index: number; issues: string[] }> = [];
    const seen = new Set<string>();
    let validCount = 0;

    for (let index = 0; index < loaded.rules.length; index++) {
      const entry = loaded.rules[index];
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
        errors.push({ index: index + 1, issues: result.issues });
        continue;
      }
      if (seen.has(result.rule.id)) {
        errors.push({
          index: index + 1,
          issues: [`duplicate rule id: ${result.rule.id}`],
        });
        continue;
      }
      seen.add(result.rule.id);
      validCount += 1;
    }

    return {
      file: displayPath,
      ok: errors.length === 0,
      ruleCount: validCount,
      errors,
    };
  });
}

export function packRuleIds(pack: RulePack): Set<string> {
  return new Set(pack.rules.map((r) => r.id));
}
