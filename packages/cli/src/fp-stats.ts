import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveFingerprint } from "./fix.js";
import { loadTrackingFile, type TrackingFile } from "./dashboard.js";
import { loadFeedbackFile, loadReportFile, type FeedbackFile } from "./learn.js";

export const DEFAULT_MIN_SAMPLE = 10;
export const DEFAULT_FP_THRESHOLD = 0.3;

export type FpSignalKind = "false_positive" | "wontfix" | "confirm" | "resolved";

export interface FpStatsSettings {
  minSample: number;
  fpThreshold: number;
}

export interface FpRuleStats {
  ruleId: string;
  sample: number;
  falsePositive: number;
  wontfix: number;
  confirm: number;
  resolved: number;
  rate: number | null;
  noisy: boolean;
}

export interface FpStats {
  settings: FpStatsSettings;
  sources: {
    reports: number;
    feedbackFiles: number;
    trackingFiles: number;
    ignoredDecisions: number;
    unreviewedTracking: number;
  };
  rules: FpRuleStats[];
  warnings: string[];
}

function extractFindingRefs(report: Record<string, unknown>): Array<{ fingerprint: string; ruleId?: string }> {
  const refs: Array<{ fingerprint: string; ruleId?: string }> = [];
  if (!Array.isArray(report["findings"])) return refs;
  for (const item of report["findings"] as unknown[]) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const finding = item as Record<string, unknown>;
    if (typeof finding["fingerprint"] !== "string") continue;
    refs.push({
      fingerprint: finding["fingerprint"],
      ruleId: typeof finding["ruleId"] === "string" ? finding["ruleId"] : undefined,
    });
  }
  return refs;
}

export function buildFpStats(input: {
  reports: Record<string, unknown>[];
  feedbacks: FeedbackFile[];
  trackings: TrackingFile[];
  settings: FpStatsSettings;
}): FpStats {
  const ruleByFp = new Map<string, string>();
  for (const report of input.reports) {
    for (const ref of extractFindingRefs(report)) {
      ruleByFp.set(ref.fingerprint, ref.ruleId ?? "");
    }
  }
  const knownFps = [...ruleByFp.keys()];

  const signals = new Map<string, FpSignalKind>();
  const warnings: string[] = [];
  let ignoredDecisions = 0;
  let unreviewedTracking = 0;

  for (const feedback of input.feedbacks) {
    for (const item of feedback.items) {
      if (item.decision === "severity_change" || item.decision === "suggest_rule") {
        ignoredDecisions += 1;
        continue;
      }
      const resolved = resolveFingerprint(knownFps, item.fingerprint);
      let fingerprint: string;
      if (resolved.ok) {
        fingerprint = resolved.fingerprint;
      } else if (item.fingerprint.length === 64) {
        fingerprint = item.fingerprint;
      } else {
        warnings.push(`feedback fingerprint "${item.fingerprint}" skipped: ${resolved.error}`);
        continue;
      }
      if (!ruleByFp.has(fingerprint)) {
        warnings.push(`fingerprint ${fingerprint} not in reports (skipped)`);
        continue;
      }
      signals.set(fingerprint, item.decision);
    }
  }

  for (const tracking of input.trackings) {
    for (const [fingerprint, state] of Object.entries(tracking.states)) {
      if (state.status !== "resolved") {
        unreviewedTracking += 1;
        continue;
      }
      if (!ruleByFp.has(fingerprint)) {
        warnings.push(`tracking fingerprint ${fingerprint} not in reports (skipped)`);
        continue;
      }
      if (signals.has(fingerprint)) continue;
      signals.set(fingerprint, "resolved");
    }
  }

  const counters = new Map<string, { falsePositive: number; wontfix: number; confirm: number; resolved: number }>();
  for (const [fingerprint, kind] of signals) {
    const ruleId = ruleByFp.get(fingerprint) ?? "";
    if (ruleId === "") {
      warnings.push(`fingerprint ${fingerprint} has no ruleId in reports (skipped)`);
      continue;
    }
    let agg = counters.get(ruleId);
    if (agg === undefined) {
      agg = { falsePositive: 0, wontfix: 0, confirm: 0, resolved: 0 };
      counters.set(ruleId, agg);
    }
    if (kind === "false_positive") agg.falsePositive += 1;
    else if (kind === "wontfix") agg.wontfix += 1;
    else if (kind === "confirm") agg.confirm += 1;
    else agg.resolved += 1;
  }

  const rules: FpRuleStats[] = [...counters.entries()]
    .map(([ruleId, agg]) => {
      const sample = agg.falsePositive + agg.wontfix + agg.confirm + agg.resolved;
      const rate = sample > 0 ? agg.falsePositive / sample : null;
      return {
        ruleId,
        sample,
        falsePositive: agg.falsePositive,
        wontfix: agg.wontfix,
        confirm: agg.confirm,
        resolved: agg.resolved,
        rate,
        noisy:
          sample >= input.settings.minSample && rate !== null && rate > input.settings.fpThreshold,
      };
    })
    .sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));

  return {
    settings: { minSample: input.settings.minSample, fpThreshold: input.settings.fpThreshold },
    sources: {
      reports: input.reports.length,
      feedbackFiles: input.feedbacks.length,
      trackingFiles: input.trackings.length,
      ignoredDecisions,
      unreviewedTracking,
    },
    rules,
    warnings,
  };
}

export function fpStatsJson(stats: FpStats): string {
  return `${JSON.stringify(
    {
      settings: stats.settings,
      sources: stats.sources,
      rules: stats.rules,
      warnings: stats.warnings,
    },
    null,
    2,
  )}\n`;
}

function pct(rate: number | null): string {
  if (rate === null) return "-";
  return `${Math.round(rate * 1000) / 10}%`;
}

export function renderFpStatsConsole(stats: FpStats): string {
  const lines: string[] = [
    `fp-stats: ${stats.rules.length} rule${stats.rules.length === 1 ? "" : "s"} · min sample ${stats.settings.minSample} · fp threshold ${pct(stats.settings.fpThreshold)}`,
    "",
  ];
  if (stats.rules.length === 0) {
    lines.push("no reviewed findings (need feedback or tracking resolved)", "");
  } else {
    const header = ["RULE", "SAMPLE", "FP", "RATE", "WONTFIX", "CONFIRM", "RESOLVED", "STATUS"];
    const rows = stats.rules.map((r) => [
      r.ruleId,
      String(r.sample),
      String(r.falsePositive),
      pct(r.rate),
      String(r.wontfix),
      String(r.confirm),
      String(r.resolved),
      r.noisy ? "noisy" : r.sample < stats.settings.minSample ? "insufficient sample" : "ok",
    ]);
    const widths = header.map(
      (h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)),
    );
    lines.push(header.map((h, i) => h.padEnd(widths[i]!)).join("  "));
    for (const row of rows) {
      lines.push(row.map((cell, i) => cell.padEnd(widths[i]!)).join("  "));
    }
    lines.push("");
  }
  const src = stats.sources;
  lines.push(
    `sources: ${src.reports} report${src.reports === 1 ? "" : "s"} · ${src.feedbackFiles} feedback · ${src.trackingFiles} tracking · ${src.ignoredDecisions} ignored · ${src.unreviewedTracking} unreviewed`,
  );
  return lines.join("\n");
}

const STATS_USAGE = [
  "Usage:",
  "  ankaa skills stats --report <r.json> [--report <r2.json>]",
  "                     [--feedback <f.json> ...] [--tracking <t.json> ...]",
  "                     [--min-sample <n>] [--fp-threshold <0..1>]",
  "                     [--format console|json] [--output <file>]",
  "",
  "Local FP report per rule from learn feedback + dashboard tracking.",
  "Informative only: never mutates skills, packs or severities.",
  "",
].join("\n");

export function runSkillsStatsCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(STATS_USAGE);
    return 0;
  }

  const reportPaths: string[] = [];
  const feedbackPaths: string[] = [];
  const trackingPaths: string[] = [];
  let format: "console" | "json" = "console";
  let outputPath: string | undefined;
  let minSample = DEFAULT_MIN_SAMPLE;
  let fpThreshold = DEFAULT_FP_THRESHOLD;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--report" || token === "--feedback" || token === "--tracking") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr(`error: ${token} requires a file path\n`);
        return 2;
      }
      if (token === "--report") reportPaths.push(v);
      else if (token === "--feedback") feedbackPaths.push(v);
      else trackingPaths.push(v);
      continue;
    }
    if (token === "--format") {
      const v = argv[++i];
      if (v !== "console" && v !== "json") {
        io.stderr("error: --format must be console | json\n");
        return 2;
      }
      format = v;
      continue;
    }
    if (token === "--output") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr("error: --output requires a file path\n");
        return 2;
      }
      outputPath = v;
      continue;
    }
    if (token === "--min-sample") {
      const v = argv[++i];
      const parsed = Number(v);
      if (v === undefined || !Number.isInteger(parsed) || parsed < 1) {
        io.stderr("error: --min-sample requires an integer >= 1\n");
        return 2;
      }
      minSample = parsed;
      continue;
    }
    if (token === "--fp-threshold") {
      const v = argv[++i];
      const parsed = Number(v);
      if (v === undefined || Number.isNaN(parsed) || parsed <= 0 || parsed > 1) {
        io.stderr("error: --fp-threshold requires a number in (0, 1]\n");
        return 2;
      }
      fpThreshold = parsed;
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

  if (reportPaths.length === 0) {
    io.stderr("error: skills stats requires at least one --report\n");
    return 2;
  }
  if (feedbackPaths.length === 0 && trackingPaths.length === 0) {
    io.stderr("error: skills stats requires at least one --feedback or --tracking\n");
    return 2;
  }
  if (outputPath !== undefined && format !== "json") {
    io.stderr("error: --output requires --format json\n");
    return 2;
  }

  const reports: Record<string, unknown>[] = [];
  for (const p of reportPaths) {
    const loaded = loadReportFile(resolve(io.cwd, p));
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    reports.push(loaded.report);
  }

  const feedbacks: FeedbackFile[] = [];
  for (const p of feedbackPaths) {
    const loaded = loadFeedbackFile(resolve(io.cwd, p));
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    feedbacks.push(loaded.feedback);
  }

  const trackings: TrackingFile[] = [];
  for (const p of trackingPaths) {
    const abs = resolve(io.cwd, p);
    if (!existsSync(abs)) {
      io.stderr(`error: tracking not found: ${p}\n`);
      return 2;
    }
    const loaded = loadTrackingFile(abs);
    if (!loaded.ok) {
      io.stderr(`error: ${loaded.error}\n`);
      return 2;
    }
    trackings.push(loaded.tracking);
  }

  const stats = buildFpStats({ reports, feedbacks, trackings, settings: { minSample, fpThreshold } });

  for (const warning of stats.warnings) {
    io.stderr(`warning: ${warning}\n`);
  }

  if (format === "json") {
    io.stdout(fpStatsJson(stats));
  } else {
    io.stdout(`${renderFpStatsConsole(stats)}\n`);
  }

  if (outputPath !== undefined) {
    const abs = resolve(io.cwd, outputPath);
    try {
      writeFileSync(abs, fpStatsJson(stats), "utf8");
    } catch (err) {
      io.stderr(
        `error: cannot write ${outputPath}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    io.stdout(`wrote: ${abs}\n`);
  }

  return 0;
}
