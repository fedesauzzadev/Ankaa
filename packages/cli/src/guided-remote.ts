import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packageVersion, type Rule } from "@ankaa/core";
import type { Report } from "@ankaa/reporters";
import { analyzeUseCase } from "./analyze.js";
import { prepareAnalysis } from "./analyze-setup.js";
import { loadConfig } from "./config.js";
import { discoverSpecs } from "./discovery.js";
import { createFsPackRepository, createFsSpecLoader } from "./loaders.js";
import { cloneRepo, cloneRemoteRepo, listOrgRepos, validateGitRemoteUrl } from "./github.js";
import { aggregateScans, type OrgReport, type RepoScan, type SkippedRepo } from "./scan.js";

export type RemoteNote = (line: string) => void;

function normalizeLabel(absPath: string, cwd: string): string {
  const rel = absPath.startsWith(cwd)
    ? absPath.slice(cwd.length).replace(/^[\\/]+/, "")
    : absPath;
  return rel.split("\\").join("/");
}

async function analyzeRepoDir(
  repoDir: string,
): Promise<
  | {
      ok: true;
      report: Report;
      specs: number;
    }
  | { ok: false; error: string }
> {
  const configResult = loadConfig(repoDir, undefined);
  if (!configResult.ok) {
    return { ok: false, error: configResult.error };
  }
  const prepared = prepareAnalysis(repoDir, configResult.config, {
    rulesFiles: [],
    baselineMode: configResult.config.baseline?.enabled === true ? "read" : "off",
  });
  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }
  const setup = prepared.setup;
  const discovered = discoverSpecs(repoDir);
  if (!discovered.ok) {
    return { ok: false, error: "no specs found" };
  }
  const outcome = await analyzeUseCase(
    {
      loader: createFsSpecLoader(),
      packs: createFsPackRepository(repoDir),
      sink: { async write() {} },
    },
    {
      inputs: discovered.paths.map((p) => resolve(repoDir, p)),
      labelFor: (p) => normalizeLabel(p, repoDir),
      failOn: "never",
      customRules: setup.customRules as Rule[] | undefined,
      disabledRuleIds: setup.disabledRuleIds,
      severityOverrides: setup.severityOverrides,
      skillsSuppressions: setup.skillsSuppressions,
      baselineFingerprints: setup.baselineFingerprints,
      toolVersion: packageVersion(),
    },
  );
  if (!outcome.ok) {
    return { ok: false, error: outcome.error };
  }
  return { ok: true, report: outcome.report, specs: discovered.paths.length };
}

export type AnalyzeRemoteRepoResult =
  | { ok: true; report: Report; repoDirName: string }
  | { ok: false; error: string };

/**
 * Clone a remote Git repository into a temporary directory (network action,
 * explicitly consented by the caller) and analyze the checkout locally.
 * The clone is removed before returning.
 */
export async function analyzeRemoteRepo(
  opts: { url: string },
  note: RemoteNote = () => {},
): Promise<AnalyzeRemoteRepoResult> {
  const validated = validateGitRemoteUrl(opts.url);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  let tempRoot: string | undefined;
  try {
    tempRoot = mkdtempSync(join(tmpdir(), "ankaa-guided-repo-"));
    const repoDir = join(tempRoot, "repo");
    note("cloning repository (network)…");
    const cloned = await cloneRemoteRepo(opts.url, repoDir);
    if (!cloned.ok) {
      return { ok: false, error: cloned.error };
    }
    note("analyzing cloned files locally…");
    const analyzed = await analyzeRepoDir(repoDir);
    if (!analyzed.ok) {
      return { ok: false, error: analyzed.error };
    }
    note(`analyzed ${analyzed.specs} spec(s) from the clone`);
    return { ok: true, report: analyzed.report, repoDirName: "repo" };
  } catch (err) {
    return {
      ok: false,
      error: `remote analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (tempRoot !== undefined) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // best-effort cleanup of the temporary clone
      }
    }
  }
}

export type AnalyzeGithubOrgResult =
  | { ok: true; report: OrgReport }
  | { ok: false; error: string };

/**
 * List the repositories of a GitHub organization (network action, explicitly
 * consented by the caller), clone each one into a temporary directory and
 * analyze them locally. Fresh scan: nothing is persisted under .ankaa;
 * resumable runs remain available via `scan-org --resume`.
 */
export async function analyzeGithubOrg(
  opts: { org: string; token: string; maxRepos?: number },
  note: RemoteNote = () => {},
): Promise<AnalyzeGithubOrgResult> {
  const maxRepos = opts.maxRepos ?? 100;
  note(`listing repositories of ${opts.org} via the GitHub API (network)…`);
  const listed = await listOrgRepos("https://api.github.com", opts.org, opts.token, maxRepos);
  if (!listed.ok) {
    return { ok: false, error: listed.error };
  }
  if (listed.repos.length === 0) {
    return { ok: false, error: `organization has no repositories: ${opts.org}` };
  }
  note(`found ${listed.repos.length} repositories`);

  let tempRoot: string | undefined;
  const skipped: SkippedRepo[] = [];
  try {
    tempRoot = mkdtempSync(join(tmpdir(), "ankaa-guided-org-"));
    const scans: RepoScan[] = [];
    for (const repo of listed.repos) {
      const dest = join(tempRoot, repo.name);
      note(`cloning ${repo.name} (network)…`);
      const cloned = await cloneRepo(repo.cloneUrl, dest);
      if (!cloned.ok) {
        skipped.push({ name: repo.name, reason: cloned.error });
        note(`skipped ${repo.name}: ${cloned.error}`);
        continue;
      }
      const analyzed = await analyzeRepoDir(dest);
      if (!analyzed.ok) {
        skipped.push({ name: repo.name, reason: analyzed.error });
        note(`skipped ${repo.name}: ${analyzed.error}`);
        continue;
      }
      scans.push({
        name: repo.name,
        specs: analyzed.specs,
        findings: analyzed.report.summary.total,
        errors: analyzed.report.summary.error,
        warnings: analyzed.report.summary.warning,
        infos: analyzed.report.summary.info,
        score: analyzed.report.score?.value ?? 0,
        grade: analyzed.report.score?.grade ?? "—",
        coverage: analyzed.report.coverage?.pct ?? 0,
      });
      note(
        `scanned ${repo.name} (${analyzed.specs} specs, ${analyzed.report.summary.total} findings, score ${analyzed.report.score?.value ?? 0})`,
      );
    }
    if (scans.length === 0) {
      return { ok: false, error: "no repositories with specs could be analyzed" };
    }
    const report = aggregateScans(scans, undefined, "ankaa", packageVersion(), opts.org);
    report.skipped = [...skipped, ...report.skipped].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    return { ok: true, report };
  } catch (err) {
    return {
      ok: false,
      error: `organization analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (tempRoot !== undefined) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // best-effort cleanup of the temporary clones
      }
    }
  }
}
