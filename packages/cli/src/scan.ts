import { parse as parseYaml } from "yaml";

export interface RepoScan {
  name: string;
  specs: number;
  findings: number;
  errors: number;
  warnings: number;
  infos: number;
  score: number;
  grade: string;
  /** Governance coverage pct (0..100) for this repo. */
  coverage: number;
}

export interface ScanTotals {
  repos: number;
  specs: number;
  findings: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface GroupScan {
  name: string;
  repos: RepoScan[];
  totals: ScanTotals;
  avgScore: number;
  avgCoverage: number;
}

export interface SkippedRepo {
  name: string;
  reason: string;
}

export interface OrgReport {
  tool: string;
  version: string;
  org: string | null;
  groups: GroupScan[];
  totals: ScanTotals;
  avgScore: number;
  avgCoverage: number;
  skipped: SkippedRepo[];
}

function cmpRepo(a: RepoScan, b: RepoScan): number {
  if (a.score !== b.score) {
    return a.score - b.score;
  }
  if (a.errors !== b.errors) {
    return b.errors - a.errors;
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function sumTotals(repos: readonly RepoScan[]): ScanTotals {
  const totals: ScanTotals = {
    repos: repos.length,
    specs: 0,
    findings: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
  };
  for (const r of repos) {
    totals.specs += r.specs;
    totals.findings += r.findings;
    totals.errors += r.errors;
    totals.warnings += r.warnings;
    totals.infos += r.infos;
  }
  return totals;
}

function avgScore(repos: readonly RepoScan[]): number {
  if (repos.length === 0) {
    return 100;
  }
  const sum = repos.reduce((n, r) => n + r.score, 0);
  return Math.round(sum / repos.length);
}

function avgCoverage(repos: readonly RepoScan[]): number {
  if (repos.length === 0) {
    return 100;
  }
  const sum = repos.reduce((n, r) => n + r.coverage, 0);
  return Math.round(sum / repos.length);
}

export function aggregateScans(
  scans: RepoScan[],
  groups: Record<string, string> | undefined,
  tool: string,
  version: string,
  org: string | null,
): OrgReport {
  const sorted = [...scans].sort(cmpRepo);
  const byGroup = new Map<string, RepoScan[]>();
  for (const scan of sorted) {
    const name = groups?.[scan.name] ?? "ungrouped";
    const list = byGroup.get(name) ?? [];
    list.push(scan);
    byGroup.set(name, list);
  }
  const groupNames = [...byGroup.keys()].sort();
  const groupScans: GroupScan[] = groupNames.map((name) => {
    const repos = byGroup.get(name) ?? [];
    return {
      name,
      repos,
      totals: sumTotals(repos),
      avgScore: avgScore(repos),
      avgCoverage: avgCoverage(repos),
    };
  });
  const all = sorted;
  return {
    tool,
    version,
    org,
    groups: groupScans,
    totals: sumTotals(all),
    avgScore: avgScore(all),
    avgCoverage: avgCoverage(all),
    skipped: [],
  };
}

export function loadGroupMapping(
  text: string,
): { ok: true; mapping: Record<string, string> } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return {
      ok: false,
      error: `invalid group mapping: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "invalid group mapping: expected a mapping of repo to group" };
  }
  const mapping: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string" || value.length === 0) {
      return {
        ok: false,
        error: `invalid group mapping: group for "${key}" must be a non-empty string`,
      };
    }
    mapping[key] = value;
  }
  return { ok: true, mapping };
}
