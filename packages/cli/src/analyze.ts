import {
  evaluate,
  type EvaluationResult,
  type Finding,
  type Rule,
  type RulePack,
  type Severity,
} from "@apigovscan/core";
import { parseSpec, type ParseError } from "@apigovscan/openapi";
import { parseGraphQL } from "@apigovscan/graphql";
import { parseProto } from "@apigovscan/grpc";
import { looksLikeAsyncApi, parseAsyncAPI } from "@apigovscan/asyncapi";
import { looksLikeWebhooks, parseWebhooks } from "@apigovscan/webhooks";
import { buildReport, type Report } from "@apigovscan/reporters";
import type { FailOn } from "./args.js";
import type { PackRepository, ReportSink, SpecLoader } from "./ports.js";
import { applySkillSuppressions, type SuppressionEntry } from "./skills.js";

export interface AnalyzeOptions {
  inputs: readonly string[];
  labelFor: (path: string) => string;
  failOn: FailOn;
  customRules?: readonly Rule[];
  disabledRuleIds?: ReadonlySet<string>;
  severityOverrides?: ReadonlyMap<string, Severity>;
  toolVersion: string;
  debug?: (line: string) => void;
  /** When set, findings whose fingerprint is in the set are suppressed by baseline. */
  baselineFingerprints?: ReadonlySet<string>;
  /**
   * Skills suppressions applied post-evaluate, pre-baseline.
   * `matchRegexes` is keyed by suppression entry index.
   */
  skillsSuppressions?: {
    suppressions: readonly SuppressionEntry[];
    matchRegexes: ReadonlyMap<number, RegExp>;
  };
}

export type AnalyzeOutcome =
  | {
      ok: true;
      report: Report;
      exitCode: 0 | 1;
      /** All findings before skills/baseline filters (for --write-baseline). */
      allFindings: Finding[];
      suppressedCount: number;
      skillsSuppressedCount: number;
    }
  | { ok: false; exitCode: 2; error: string };

function formatParseErrors(label: string, errors: ParseError[]): string {
  const lines = errors.map((e) => {
    const loc =
      e.line !== undefined ? `line ${e.line}` : e.jsonPointer !== undefined ? e.jsonPointer : "";
    return loc ? `  ${loc}: ${e.message}` : `  ${e.message}`;
  });
  return `failed to parse ${label}\n${lines.join("\n")}`;
}

function prefixFindings(result: EvaluationResult, label: string, multi: boolean): EvaluationResult {
  if (!multi) return result;
  return {
    ...result,
    findings: result.findings.map((f): Finding => ({ ...f, location: `${label}#${f.location}` })),
  };
}

function computeExitCode(report: Report, failOn: FailOn): 0 | 1 {
  if (failOn === "never") return 0;
  const { error, warning, total } = report.summary;
  if (failOn === "error") return error > 0 ? 1 : 0;
  if (failOn === "warning") return error + warning > 0 ? 1 : 0;
  return total > 0 ? 1 : 0;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isGraphqlInput(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".graphql") || lower.endsWith(".gql");
}

export function isGrpcInput(path: string): boolean {
  return path.toLowerCase().endsWith(".proto");
}

type InputProtocol = "graphql" | "grpc" | "asyncapi" | "webhooks" | null;

function protocolForInput(path: string, bytes: Uint8Array): InputProtocol {
  if (isGraphqlInput(path)) return "graphql";
  if (isGrpcInput(path)) return "grpc";
  const lower = path.toLowerCase();
  if (
    path === "-" ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".json")
  ) {
    if (looksLikeAsyncApi(bytes)) return "asyncapi";
    if (looksLikeWebhooks(bytes)) return "webhooks";
  }
  return null;
}

export async function analyzeUseCase(
  deps: {
    loader: SpecLoader;
    packs: PackRepository;
    sink: ReportSink;
  },
  opts: AnalyzeOptions,
): Promise<AnalyzeOutcome> {
  const debug = opts.debug ?? (() => {});
  const started = performance.now();

  let packList: RulePack[];
  try {
    const t = performance.now();
    packList = await deps.packs.loadActive();
    debug(
      `load packs ${packList.map((p) => `${p.id}@${p.version}`).join(", ")} ${(performance.now() - t).toFixed(2)}ms`,
    );
  } catch (err) {
    return {
      ok: false,
      exitCode: 2,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const sortedInputs = [...opts.inputs].sort(cmp);
  const multi = sortedInputs.length > 1;
  const inputs: Array<{ path: string; sha256: string }> = [];
  const results: EvaluationResult[] = [];
  const usedPacks = new Map<string, string>();
  const protocolPacks = new Map<string, RulePack>();

  for (const path of sortedInputs) {
    const label = opts.labelFor(path);

    let bytes: Uint8Array;
    try {
      const t = performance.now();
      bytes = await deps.loader.load(path);
      debug(`load ${label} ${bytes.byteLength}B ${(performance.now() - t).toFixed(2)}ms`);
    } catch (err) {
      return {
        ok: false,
        exitCode: 2,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const protocol = protocolForInput(path, bytes);
    const tParse = performance.now();
    let parsed:
      | ReturnType<typeof parseSpec>
      | ReturnType<typeof parseGraphQL>
      | ReturnType<typeof parseProto>
      | ReturnType<typeof parseAsyncAPI>
      | ReturnType<typeof parseWebhooks>;
    let activePacks = packList;
    if (protocol !== null) {
      let protocolPack = protocolPacks.get(protocol);
      if (protocolPack === undefined) {
        try {
          protocolPack = await deps.packs.loadProtocol(protocol);
        } catch (err) {
          return {
            ok: false,
            exitCode: 2,
            error: err instanceof Error ? err.message : String(err),
          };
        }
        protocolPacks.set(protocol, protocolPack);
      }
      activePacks = [protocolPack];
      usedPacks.set(protocolPack.id, protocolPack.version);
      parsed =
        protocol === "graphql"
          ? parseGraphQL(bytes, { sourceLabel: label })
          : protocol === "grpc"
            ? parseProto(bytes, { sourceLabel: label })
            : protocol === "asyncapi"
              ? parseAsyncAPI(bytes, { sourceLabel: label })
              : parseWebhooks(bytes, { sourceLabel: label });
    } else {
      for (const pack of packList) usedPacks.set(pack.id, pack.version);
      parsed = parseSpec(bytes, { sourceLabel: label });
    }
    if (!parsed.ok) {
      return {
        ok: false,
        exitCode: 2,
        error: formatParseErrors(label, parsed.errors),
      };
    }
    debug(`parse ${label} ${(performance.now() - tParse).toFixed(2)}ms`);

    const tEval = performance.now();
    const result = evaluate({
      specs: [parsed.spec],
      packs: activePacks,
      customRules: opts.customRules as Rule[] | undefined,
      disabledRuleIds: opts.disabledRuleIds as Set<string> | undefined,
      severityOverrides: opts.severityOverrides as Map<string, Severity> | undefined,
    });
    if (result.errors.length > 0) {
      const detail = result.errors
        .map((e) => `${e.ruleId ?? "(unknown)"}: ${e.issues.join("; ")}`)
        .join("; ");
      return {
        ok: false,
        exitCode: 2,
        error: `rule evaluation failed: ${detail}`,
      };
    }
    debug(
      `evaluate ${label} ${(performance.now() - tEval).toFixed(2)}ms (${result.findings.length} findings)`,
    );

    inputs.push({ path: label, sha256: `sha256:${parsed.spec.inputHash}` });
    results.push(prefixFindings(result, label, multi));
  }

  const tReport = performance.now();

  const allFindings = results.flatMap((r) => r.findings);

  // Skills: severity overrides already applied at evaluate; suppress post-evaluate.
  let skillsSuppressedCount = 0;
  let afterSkills = results;
  if (opts.skillsSuppressions !== undefined && opts.skillsSuppressions.suppressions.length > 0) {
    const { suppressions, matchRegexes } = opts.skillsSuppressions;
    const kept: EvaluationResult[] = [];
    for (const r of results) {
      const { visible, suppressed } = applySkillSuppressions(
        r.findings,
        suppressions,
        matchRegexes,
      );
      skillsSuppressedCount += suppressed;
      kept.push({ ...r, findings: visible });
    }
    afterSkills = kept;
  }

  let filteredResults = afterSkills;
  let suppressedCount = 0;
  if (opts.baselineFingerprints !== undefined) {
    const set = opts.baselineFingerprints;
    const kept: EvaluationResult[] = [];
    for (const r of afterSkills) {
      const visible = r.findings.filter((f) => !set.has(f.fingerprint));
      suppressedCount += r.findings.length - visible.length;
      kept.push({ ...r, findings: visible });
    }
    filteredResults = kept;
  }

  const report = buildReport({
    results: filteredResults,
    inputs,
    packs: [...usedPacks].map(([id, version]) => ({ id, version })),
    toolVersion: opts.toolVersion,
    meta: { durationMs: Math.round(performance.now() - started) },
    ...(opts.baselineFingerprints !== undefined ? { suppressed: suppressedCount } : {}),
    ...(skillsSuppressedCount > 0 ? { skillsSuppressed: skillsSuppressedCount } : {}),
  });
  debug(`report ${report.findings.length} findings ${Math.round(performance.now() - tReport)}ms`);

  try {
    await deps.sink.write(report);
  } catch (err) {
    return {
      ok: false,
      exitCode: 2,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: true,
    report,
    exitCode: computeExitCode(report, opts.failOn),
    allFindings,
    suppressedCount,
    skillsSuppressedCount,
  };
}
