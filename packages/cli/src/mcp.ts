import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  explain,
  packageVersion,
  type Finding,
  type Rule,
  type RuleExplanation,
  type Severity,
} from "@ankaa/core";
import type { Report } from "@ankaa/reporters";
import type { McpToolHandlers, ToolResult } from "@ankaa/mcp";
import type { FailOn } from "./args.js";
import { analyzeUseCase } from "./analyze.js";
import { prepareAnalysis } from "./analyze-setup.js";
import { reviewUseCase } from "./review.js";
import { loadConfig, resolveCustomRulePaths } from "./config.js";
import { discoverSpecs } from "./discovery.js";
import {
  collectCustomRules,
  packRuleIds,
  validateRulesFiles,
  type RulesSource,
} from "./custom-rules.js";
import {
  compileMatchRegexes,
  loadSkills,
  mergeSeverityOverrides,
  resolveSkillsDir,
} from "./skills.js";
import { createFsPackRepository, createFsSpecLoader } from "./loaders.js";
import { defaultPackSearchRoots, findElitePackDir, loadPackFromDir } from "./pack-fs.js";
import { fingerprintSet, loadBaselineFile, resolveBaselinePath } from "./baseline.js";
import { chatCompletion, loadLlmConfig } from "./llm.js";
import {
  buildFixMessages,
  extractSpecFragment,
  parseFixResponse,
  resolveFingerprint,
  splitFindingTarget,
} from "./fix.js";

function loadElitePackOrThrow(cwd: string) {
  const dir = findElitePackDir(defaultPackSearchRoots(cwd));
  if (!dir) {
    throw new Error(
      "elite pack not found (searched for packs/elite/pack.yaml from cwd and CLI install)",
    );
  }
  return loadPackFromDir(dir);
}

function ok(payload: unknown): ToolResult {
  return { payload };
}

function fail(error: string): ToolResult {
  return { payload: { ok: false, error }, isError: true };
}

function normalizeLabel(absPath: string, cwd: string): string {
  const rel = absPath.startsWith(cwd) ? absPath.slice(cwd.length).replace(/^[\\/]+/, "") : absPath;
  return rel.split("\\").join("/");
}

function applyConfigRules(config: { rules?: Record<string, Severity | "off"> }): {
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

async function analyzeSpecHandler(
  cwd: string,
  input: { path: string; failOn?: string; rules?: string[] },
): Promise<ToolResult> {
  if (!existsSync(input.path)) {
    return fail(`input not found: ${input.path}`);
  }

  const configResult = loadConfig(cwd, undefined);
  if (!configResult.ok) {
    return fail(configResult.error);
  }
  const config = configResult.config;
  if (config.standards?.pack !== undefined && config.standards.pack !== "elite") {
    return fail(
      `unknown pack "${config.standards.pack}" (f1 ships only the embedded "elite" pack)`,
    );
  }

  const failOn = (input.failOn ?? config.failOn ?? "error") as FailOn;

  const skillsDir = resolveSkillsDir(config, cwd, undefined);
  const skillsResult = loadSkills(skillsDir, packageVersion());
  if (!skillsResult.ok) {
    return fail(skillsResult.error);
  }
  const skills = skillsResult.skills;

  const configRuleResult = applyConfigRules(config);
  const severityOverrides = mergeSeverityOverrides(skills.severities, configRuleResult.overrides);
  const disabled = configRuleResult.disabled;

  let customRules: Rule[] | undefined;
  try {
    const sources: RulesSource[] = [];
    for (const path of resolveCustomRulePaths(config, cwd)) {
      sources.push({ kind: "file", path });
    }
    for (const path of input.rules ?? []) {
      sources.push({ kind: "file", path: isAbsolute(path) ? path : resolve(cwd, path) });
    }
    const dir = findElitePackDir(defaultPackSearchRoots(cwd));
    const eliteIds = dir ? packRuleIds(loadPackFromDir(dir)) : undefined;
    const collectedRules: Rule[] = [];
    if (sources.length > 0) {
      const collected = collectCustomRules(sources, packageVersion(), {
        eliteRuleIds: eliteIds,
      });
      if (!collected.ok) {
        return fail(collected.error);
      }
      collectedRules.push(...collected.rules);
    }
    if (skills.activeDraftRules.length > 0) {
      const seen = new Set(collectedRules.map((r) => r.id));
      for (const draft of skills.activeDraftRules) {
        if (seen.has(draft.id) || eliteIds?.has(draft.id) === true) {
          return fail(`duplicate rule id ${draft.id} (skills draft and custom rules)`);
        }
        seen.add(draft.id);
        collectedRules.push(draft);
      }
    }
    if (collectedRules.length > 0) {
      customRules = collectedRules;
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }

  let skillsMatchRegexes: Map<number, RegExp> | undefined;
  if (skills.suppressions.length > 0) {
    const compiled = compileMatchRegexes(skills.suppressions, skillsDir);
    if (!compiled.ok) {
      return fail(compiled.error);
    }
    skillsMatchRegexes = compiled.map;
  }

  let baselineFingerprints: Set<string> | undefined;
  if (config.baseline?.enabled === true) {
    const baselinePath = resolveBaselinePath(
      undefined,
      config.baseline.path,
      config.configDir,
      cwd,
    );
    const loaded = loadBaselineFile(baselinePath);
    if (!loaded.ok) {
      return fail(loaded.error);
    }
    baselineFingerprints = fingerprintSet(loaded.baseline);
  }

  let inputs: string[];
  if (statSync(input.path).isDirectory()) {
    const discovered = discoverSpecs(input.path);
    if (!discovered.ok) {
      return fail(discovered.error);
    }
    inputs = discovered.paths.map((p) => resolve(input.path, p));
  } else {
    inputs = [input.path];
  }

  const outcome = await analyzeUseCase(
    {
      loader: createFsSpecLoader(),
      packs: createFsPackRepository(cwd),
      sink: { async write() {} },
    },
    {
      inputs,
      labelFor: (p) => normalizeLabel(p, cwd),
      failOn,
      customRules,
      disabledRuleIds: disabled,
      severityOverrides,
      toolVersion: packageVersion(),
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
    return fail(outcome.error);
  }

  return ok({
    ok: true,
    toolVersion: outcome.report.tool.version,
    packs: outcome.report.packs,
    summary: outcome.report.summary,
    score: outcome.report.score,
    reportHash: outcome.report.reportHash,
    findings: outcome.report.findings,
    totalFindings: outcome.report.findings.length,
    gate: { failOn, failed: outcome.exitCode === 1 },
  });
}

function projectReviewFinding(finding: Finding): Record<string, unknown> {
  return {
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    severity: finding.severity,
    category: finding.category,
    message: finding.message,
    location: finding.location,
    ...(finding.apiLocation !== undefined ? { apiLocation: finding.apiLocation } : {}),
    ...(finding.fix !== undefined ? { fix: finding.fix } : {}),
    ...(finding.source !== undefined ? { source: finding.source } : {}),
    packId: finding.packId,
  };
}

async function reviewApiChangeHandler(
  cwd: string,
  input: { baselinePath: string; candidatePath: string; failOn?: string },
): Promise<ToolResult> {
  for (const path of [input.baselinePath, input.candidatePath]) {
    if (!existsSync(path)) {
      return fail(`input not found: ${path}`);
    }
    if (statSync(path).isDirectory()) {
      return fail(`review expects spec files, not directories: ${path}`);
    }
  }

  const configResult = loadConfig(cwd, undefined);
  if (!configResult.ok) {
    return fail(configResult.error);
  }
  const config = configResult.config;
  if (config.standards?.pack !== undefined && config.standards.pack !== "elite") {
    return fail(
      `unknown pack "${config.standards.pack}" (f1 ships only the embedded "elite" pack)`,
    );
  }
  const failOn = (input.failOn ?? config.failOn ?? "error") as FailOn;

  const prepared = prepareAnalysis(cwd, config, { rulesFiles: [], baselineMode: "off" });
  if (!prepared.ok) {
    return fail(prepared.error);
  }

  const evaluation = await reviewUseCase(
    { loader: createFsSpecLoader(), packs: createFsPackRepository(cwd) },
    {
      cwd,
      baselinePath: input.baselinePath,
      candidatePath: input.candidatePath,
      setup: prepared.setup,
      failOn,
      toolVersion: packageVersion(),
    },
  );

  if (!evaluation.ok && !evaluation.comparisonUnsupported) {
    return fail(evaluation.error);
  }

  if (!evaluation.ok) {
    const review = evaluation.review;
    return ok({
      ok: true,
      schemaVersion: review.schemaVersion,
      outcome: review.outcome,
      baseline: review.baseline,
      candidate: review.candidate,
      comparison: review.comparison,
      policy: review.policy,
      toolVersion: review.tool.version,
      packs: review.packs,
      summary: review.summary,
      findings: review.findings.map(projectReviewFinding),
      totalFindings: review.findings.length,
      reportHash: review.reportHash,
      errors: review.errors,
      note: "comparison unsupported: candidate governance findings only; this is not a clean review",
    });
  }

  const review = evaluation.review;
  return ok({
    ok: true,
    schemaVersion: review.schemaVersion,
    outcome: review.outcome,
    baseline: review.baseline,
    candidate: review.candidate,
    comparison: review.comparison,
    policy: review.policy,
    toolVersion: review.tool.version,
    packs: review.packs,
    summary: review.summary,
    findings: review.findings.map(projectReviewFinding),
    totalFindings: review.findings.length,
    reportHash: review.reportHash,
    gate: { failOn, failed: evaluation.exitCode === 1 },
  });
}

function listRulesPayload(
  elite: { id: string; version: string; rules: Rule[] },
  custom: Rule[],
): unknown {
  const byId = (a: Rule, b: Rule) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const rules = [...elite.rules, ...custom].sort(byId).map((r) => ({
    id: r.id,
    severity: r.severity,
    category: r.category,
    message: r.message,
    packId: r.packId,
    packVersion: r.packVersion,
    ...(r.source !== undefined ? { source: r.source } : {}),
  }));
  return {
    ok: true,
    packs: [
      { id: elite.id, version: elite.version, count: elite.rules.length },
      ...(custom.length > 0
        ? [{ id: "custom", version: packageVersion(), count: custom.length }]
        : []),
    ],
    rules,
  };
}

async function loadCustomForTools(
  cwd: string,
  rulesFiles: readonly string[] | undefined,
  elite: ReturnType<typeof loadElitePackOrThrow>,
): Promise<{ ok: true; rules: Rule[] } | { ok: false; error: string }> {
  if (rulesFiles === undefined || rulesFiles.length === 0) {
    return { ok: true, rules: [] };
  }
  const sources: RulesSource[] = rulesFiles.map((path) => ({
    kind: "file",
    path: isAbsolute(path) ? path : resolve(cwd, path),
  }));
  const collected = collectCustomRules(sources, packageVersion(), {
    eliteRuleIds: packRuleIds(elite),
  });
  if (!collected.ok) {
    return collected;
  }
  return { ok: true, rules: collected.rules };
}

function explanationPayload(explanation: RuleExplanation): unknown {
  return {
    ok: true,
    explanation: {
      ruleId: explanation.id,
      severity: explanation.severity,
      category: explanation.category,
      message: explanation.message,
      ...(explanation.fix !== undefined ? { fix: explanation.fix } : {}),
      ...(explanation.source !== undefined ? { source: explanation.source } : {}),
      packId: explanation.packId,
      packVersion: explanation.packVersion,
    },
  };
}

export function createCliMcpHandlers(cwd: string): McpToolHandlers {
  return {
    analyzeSpec: (input) => analyzeSpecHandler(cwd, input),

    reviewApiChange: (input) => reviewApiChangeHandler(cwd, input),

    async listRules(input) {
      try {
        const elite = loadElitePackOrThrow(cwd);
        const customResult = await loadCustomForTools(cwd, input.rules, elite);
        if (!customResult.ok) {
          return fail(customResult.error);
        }
        return ok(listRulesPayload(elite, customResult.rules));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },

    async explainRule(input) {
      try {
        if (!/^[A-Z][A-Z0-9]*-\d{3}$/.test(input.ruleId)) {
          return fail(`invalid rule id format "${input.ruleId}" (expected PREFIX-NNN)`);
        }
        const elite = loadElitePackOrThrow(cwd);
        const customResult = await loadCustomForTools(cwd, input.rules, elite);
        if (!customResult.ok) {
          return fail(customResult.error);
        }
        const lookup = [...elite.rules, ...customResult.rules];
        const explanation = explain(lookup, input.ruleId);
        if (explanation === undefined) {
          return fail(`rule not found: ${input.ruleId}`);
        }
        return ok(explanationPayload(explanation));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },

    async validateCustomRules(input) {
      try {
        const outcomes = validateRulesFiles(
          input.files.map((f) => (isAbsolute(f) ? f : resolve(cwd, f))),
          packageVersion(),
          cwd,
        );
        const allOk = outcomes.every((o) => o.ok && o.structuralError === undefined);
        return ok({
          ok: allOk,
          files: outcomes.map((o) => ({
            file: o.file,
            ok: o.ok && o.structuralError === undefined,
            ruleCount: o.ruleCount,
            ...(o.structuralError !== undefined ? { error: o.structuralError } : {}),
            errors: o.errors,
          })),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
    async explainFinding(input) {
      try {
        if (!existsSync(input.reportPath)) {
          return fail(`report not found: ${input.reportPath}`);
        }
        if (!/^[0-9a-f]{8,64}$/.test(input.fingerprint)) {
          return fail(
            `invalid fingerprint (expected 8-64 hex chars; a unique prefix is enough): ${input.fingerprint}`,
          );
        }
        let report: Report;
        try {
          report = JSON.parse(readFileSync(input.reportPath, "utf8")) as Report;
        } catch (err) {
          return fail(`invalid report JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        const resolved = resolveFingerprint(
          (report.findings ?? []).map((f) => f.fingerprint),
          input.fingerprint,
        );
        if (!resolved.ok) {
          return fail(resolved.error);
        }
        const finding = report.findings?.find((f) => f.fingerprint === resolved.fingerprint);
        if (finding === undefined) {
          return fail(`finding not found: ${input.fingerprint}`);
        }
        let explanation: RuleExplanation | undefined;
        try {
          const elite = loadElitePackOrThrow(cwd);
          explanation = explain(elite.rules, finding.ruleId);
        } catch {
          explanation = undefined;
        }
        return ok({
          ok: true,
          finding,
          ...(explanation !== undefined
            ? {
                explanation: {
                  ruleId: explanation.id,
                  severity: explanation.severity,
                  category: explanation.category,
                  message: explanation.message,
                  ...(explanation.fix !== undefined ? { fix: explanation.fix } : {}),
                  ...(explanation.source !== undefined ? { source: explanation.source } : {}),
                  packId: explanation.packId,
                  packVersion: explanation.packVersion,
                },
              }
            : { explanation: null }),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
    async suggestFix(input) {
      try {
        if (!existsSync(input.reportPath)) {
          return fail(`report not found: ${input.reportPath}`);
        }
        if (!/^[0-9a-f]{8,64}$/.test(input.fingerprint)) {
          return fail(
            `invalid fingerprint (expected 8-64 hex chars; a unique prefix is enough): ${input.fingerprint}`,
          );
        }
        let report: Report;
        try {
          report = JSON.parse(readFileSync(input.reportPath, "utf8")) as Report;
        } catch (err) {
          return fail(`invalid report JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        const resolved = resolveFingerprint(
          (report.findings ?? []).map((f) => f.fingerprint),
          input.fingerprint,
        );
        if (!resolved.ok) {
          return fail(resolved.error);
        }
        const finding = report.findings?.find((f) => f.fingerprint === resolved.fingerprint);
        if (finding === undefined) {
          return fail(`finding not found: ${input.fingerprint}`);
        }
        const configResult = loadConfig(cwd, undefined);
        if (!configResult.ok) {
          return fail(configResult.error);
        }
        const llmCfg = loadLlmConfig(configResult.config.llm, process.env);
        if (llmCfg === undefined) {
          return fail(
            "llm not configured: set llm.baseUrl in ankaa.yaml (AI features are optional)",
          );
        }
        const lookup = await loadSuggestLookup(cwd, configResult.config);
        if (!lookup.ok) {
          return fail(lookup.error);
        }
        const explanation = explain(lookup.rules, finding.ruleId);
        if (explanation === undefined) {
          return fail(`rule not found: ${finding.ruleId}`);
        }
        const target = splitFindingTarget(
          finding.location,
          report.input.map((i) => i.path),
        );
        if (target.label === "<stdin>") {
          return fail("cannot suggest a fix for stdin input (analyze a file instead)");
        }
        let specPath: string | undefined;
        if (target.label !== undefined) {
          specPath = isAbsolute(target.label) ? target.label : resolve(cwd, target.label);
        } else if (report.input.length === 1 && report.input[0] !== undefined) {
          const only = report.input[0].path;
          specPath = isAbsolute(only) ? only : resolve(cwd, only);
        }
        if (specPath === undefined || !existsSync(specPath)) {
          return fail(`spec file not found: ${target.label ?? finding.location}`);
        }
        const { fragment } = extractSpecFragment(readFileSync(specPath, "utf8"), target.pointer);
        const fileLabel = target.label ?? finding.location;
        let text: string;
        try {
          text = await chatCompletion(
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
                      ...(explanation.source.url !== undefined
                        ? { url: explanation.source.url }
                        : {}),
                    },
                  }
                : {}),
              fragment,
            }),
          );
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err));
        }
        const parsed = parseFixResponse(text);
        if (!parsed.ok) {
          return fail(parsed.error);
        }
        return ok({
          ok: true,
          fingerprint: finding.fingerprint,
          patch: parsed.fix.patch,
          explanation: parsed.fix.explanation,
          confidence: parsed.fix.confidence,
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

async function loadSuggestLookup(
  cwd: string,
  config: { customRules?: string[]; configDir?: string },
): Promise<{ ok: true; rules: Rule[] } | { ok: false; error: string }> {
  try {
    const elite = loadElitePackOrThrow(cwd);
    const customResult = await loadCustomForTools(cwd, config.customRules, elite);
    if (!customResult.ok) {
      return { ok: false, error: customResult.error };
    }
    return { ok: true, rules: [...elite.rules, ...customResult.rules] };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
