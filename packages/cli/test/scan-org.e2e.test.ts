import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { DEV_LICENSE_KEY } from "../src/license.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-scan-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

type Env = Record<string, string | undefined>;

async function runCapture(
  argv: string[],
  io: { cwd?: string; env?: Env } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await run(["node", "cli", ...argv], {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    isTTY: false,
    env: io.env ?? {},
    ...io,
  });
  return { code, stdout, stderr };
}

function licEnv(): Env {
  return { APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY };
}

const TINY_SPEC = [
  "openapi: 3.1.0",
  "info:",
  "  title: Tiny",
  "  version: 1.0.0",
  "paths:",
  "  /ping:",
  "    get:",
  "      operationId: ping",
  "      responses:",
  '        "200":',
  "          description: ok",
  "",
].join("\n");

interface JsonReport {
  groups: Array<{
    name: string;
    repos: Array<{
      name: string;
      specs: number;
      findings: number;
      errors: number;
      warnings: number;
      infos: number;
      score: number;
      grade: string;
    }>;
    totals: {
      repos: number;
      specs: number;
      findings: number;
      errors: number;
      warnings: number;
      infos: number;
    };
    avgScore: number;
  }>;
  totals: {
    repos: number;
    specs: number;
    findings: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  avgScore: number;
  skipped: Array<{ name: string; reason: string }>;
}

function setupOrg(): { root: string; names: string[] } {
  const root = tempDir();
  const repoA = join(root, "repo-a");
  const repoB = join(root, "repo-b");
  const repoC = join(root, "repo-c");
  const repoEmpty = join(root, "repo-empty");
  mkdirSync(repoA, { recursive: true });
  mkdirSync(repoB, { recursive: true });
  mkdirSync(repoC, { recursive: true });
  mkdirSync(repoEmpty, { recursive: true });
  copyFileSync(petstore, join(repoA, "openapi.yaml"));
  writeFileSync(join(repoB, "openapi.yaml"), TINY_SPEC, "utf8");
  copyFileSync(petstore, join(repoC, "openapi.yaml"));
  return { root, names: ["repo-a", "repo-b", "repo-c"] };
}

async function analyzeRepo(
  dir: string,
): Promise<{ summary: { error: number; warning: number; info: number; total: number }; score: { value: number; grade: string }; specs: number }> {
  const out = await runCapture(
    ["analyze", ".", "--format", "json", "--no-color", "--fail-on", "never"],
    { cwd: dir, env: licEnv() },
  );
  expect(out.code).toBe(0);
  const report = JSON.parse(out.stdout) as {
    summary: { error: number; warning: number; info: number; total: number };
    score: { value: number; grade: string };
    input: unknown[];
  };
  return {
    summary: report.summary,
    score: report.score,
    specs: (report.input as unknown[]).length,
  };
}

describe("scan-org e2e (f8-scan-org)", () => {
  it("AC-SO.1 aggregates per-repo results identical to analyze", async () => {
    const { root, names } = setupOrg();
    const expected = new Map<string, Awaited<ReturnType<typeof analyzeRepo>>>();
    for (const name of names) {
      expected.set(name, await analyzeRepo(join(root, name)));
    }
    const out = await runCapture(["scan-org", ".", "--format", "json"], {
      cwd: root,
      env: licEnv(),
    });
    expect(out.code).toBe(0);
    const report = JSON.parse(out.stdout) as JsonReport;
    const byName = new Map(
      report.groups.flatMap((g) => g.repos).map((r) => [r.name, r]),
    );
    for (const name of names) {
      const want = expected.get(name)!;
      const got = byName.get(name)!;
      expect(got).toBeDefined();
      expect(got.specs).toBe(want.specs);
      expect(got.findings).toBe(want.summary.total);
      expect(got.errors).toBe(want.summary.error);
      expect(got.warnings).toBe(want.summary.warning);
      expect(got.infos).toBe(want.summary.info);
      expect(got.score).toBe(want.score.value);
      expect(got.grade).toBe(want.score.grade);
    }
    expect(report.skipped.map((s) => s.name)).toContain("repo-empty");
  });

  it("AC-SO.2 groups by mapping file, unmapped go to ungrouped", async () => {
    const { root } = setupOrg();
    writeFileSync(
      join(root, "groups.yaml"),
      "repo-a: shop\nrepo-b: shop\n",
      "utf8",
    );
    const out = await runCapture(
      ["scan-org", ".", "--format", "json", "--group-by", "groups.yaml"],
      { cwd: root, env: licEnv() },
    );
    expect(out.code).toBe(0);
    const report = JSON.parse(out.stdout) as JsonReport;
    expect(report.groups.map((g) => g.name)).toEqual(["shop", "ungrouped"]);
    const shop = report.groups[0]!;
    expect(shop.repos.map((r) => r.name).sort()).toEqual(["repo-a", "repo-b"]);
    expect(shop.totals.repos).toBe(2);
    const ungrouped = report.groups[1]!;
    expect(ungrouped.repos.map((r) => r.name)).toEqual(["repo-c"]);
  });

  it("AC-SO.2 invalid mapping exits 2", async () => {
    const { root } = setupOrg();
    writeFileSync(join(root, "groups.yaml"), "- just\n- a\n- list\n", "utf8");
    const out = await runCapture(
      ["scan-org", ".", "--group-by", "groups.yaml"],
      { cwd: root, env: licEnv() },
    );
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("invalid group mapping");

    const missing = await runCapture(["scan-org", ".", "--group-by", "nope.yaml"], {
      cwd: root,
      env: licEnv(),
    });
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("group file not found");
  });

  it("AC-SO.3 ranking is worst-first and deterministic", async () => {
    const { root } = setupOrg();
    const first = await runCapture(["scan-org", ".", "--format", "json"], {
      cwd: root,
      env: licEnv(),
    });
    const second = await runCapture(["scan-org", ".", "--format", "json"], {
      cwd: root,
      env: licEnv(),
    });
    expect(first.code).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    const report = JSON.parse(first.stdout) as JsonReport;
    const all = report.groups.flatMap((g) => g.repos);
    const sorted = [...all].sort((a, b) =>
      a.score !== b.score
        ? a.score - b.score
        : a.errors !== b.errors
          ? b.errors - a.errors
          : a.name < b.name
            ? -1
            : 1,
    );
    expect(all.map((r) => r.name)).toEqual(sorted.map((r) => r.name));
  });

  it("AC-SO.4 console format lists repos, totals and skipped", async () => {
    const { root } = setupOrg();
    const out = await runCapture(["scan-org", "."], {
      cwd: root,
      env: licEnv(),
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("scan-org . (3 repos)");
    expect(out.stdout).toContain("[ungrouped]");
    expect(out.stdout).toContain("repo-a");
    expect(out.stdout).toMatch(/totals: 3 repos, \d+ specs, \d+ findings/);
    expect(out.stdout).toContain("avg score");
    expect(out.stdout).toContain("skipped (1):");
    expect(out.stdout).toContain("repo-empty");
  });

  it("AC-SO.5 --out writes the report and refuses overwrite without --force", async () => {
    const { root } = setupOrg();
    const out = await runCapture(
      ["scan-org", ".", "--format", "json", "--out", "report.json"],
      { cwd: root, env: licEnv() },
    );
    expect(out.code).toBe(0);
    const file = JSON.parse(readFileSync(join(root, "report.json"), "utf8")) as JsonReport;
    expect(file.totals.repos).toBe(3);

    const again = await runCapture(
      ["scan-org", ".", "--format", "json", "--out", "report.json"],
      { cwd: root, env: licEnv() },
    );
    expect(again.code).toBe(2);
    expect(again.stderr).toContain("output exists");
    expect(again.stderr).toContain("--force");

    const forced = await runCapture(
      ["scan-org", ".", "--format", "json", "--out", "report.json", "--force"],
      { cwd: root, env: licEnv() },
    );
    expect(forced.code).toBe(0);
  });

  it("AC-SO.6 license gate", async () => {
    const { root } = setupOrg();
    const out = await runCapture(["scan-org", "."], {
      cwd: root,
      env: {},
    });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("missing license");
  });

  it("AC-SO.10 empty org exits 2 and usage errors exit 2", async () => {
    const empty = tempDir();
    mkdirSync(join(empty, "nothing-here"));
    const out = await runCapture(["scan-org", "."], {
      cwd: empty,
      env: licEnv(),
    });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("no projects with specs found");

    const usage = await runCapture(["scan-org"], {
      cwd: empty,
      env: licEnv(),
    });
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("missing required argument");

    const badFormat = await runCapture(["scan-org", ".", "--format", "yaml"], {
      cwd: empty,
      env: licEnv(),
    });
    expect(badFormat.code).toBe(2);
    expect(badFormat.stderr).toContain("invalid --format");

    const badMax = await runCapture(["scan-org", ".", "--max-repos", "0"], {
      cwd: empty,
      env: licEnv(),
    });
    expect(badMax.code).toBe(2);
    expect(badMax.stderr).toContain("--max-repos requires a positive integer");

    const noDir = await runCapture(["scan-org", "nope"], {
      cwd: empty,
      env: licEnv(),
    });
    expect(noDir.code).toBe(2);
    expect(noDir.stderr).toContain("scan directory not found");
  });
});

interface StubPage {
  repos: Array<{ name: string; clone_url: string }>;
  hasNext?: boolean;
}

async function startGithubStub(
  pages: StubPage[],
  opts?: { status?: number; requireToken?: string },
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (opts?.status !== undefined) {
      res.writeHead(opts.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "denied" }));
      return;
    }
    if (
      opts?.requireToken !== undefined &&
      req.headers.authorization !== `Bearer ${opts.requireToken}`
    ) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "bad credentials" }));
      return;
    }
    const page = Number(url.searchParams.get("page") ?? "1");
    const entry = pages[page - 1];
    if (entry === undefined) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "not found" }));
      return;
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (entry.hasNext === true) {
      const host = req.headers.host ?? "127.0.0.1";
      headers.link = `<http://${host}/orgs/acme/repos?per_page=100&page=${page + 1}>; rel="next"`;
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify(entry.repos));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function initGitRepo(dir: string, specName: string, specText: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, specName), specText, "utf8");
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "init"],
    { cwd: dir, stdio: "ignore" },
  );
}

describe("scan-org --github e2e (f8-scan-org)", () => {
  it("AC-SO.7 lists, clones and scans; broken clone becomes skipped", async () => {
    const seed = tempDir();
    const specText = readFileSync(join(repoRoot, "fixtures", "petstore-mini.yaml"), "utf8");
    initGitRepo(join(seed, "gh-a-src"), "openapi.yaml", specText);
    initGitRepo(join(seed, "gh-b-src"), "openapi.yaml", TINY_SPEC);

    const stub = await startGithubStub(
      [
        {
          repos: [
            { name: "gh-a", clone_url: pathToFileURL(join(seed, "gh-a-src")).href },
            { name: "gh-b", clone_url: pathToFileURL(join(seed, "gh-b-src")).href },
          ],
          hasNext: true,
        },
        {
          repos: [{ name: "gh-bad", clone_url: "file:///nonexistent-xyz-12345" }],
        },
      ],
      { requireToken: "good-token" },
    );
    try {
      const work = tempDir();
      const out = await runCapture(
        [
          "scan-org",
          ".",
          "--github",
          "acme",
          "--api-base",
          stub.url,
          "--workdir",
          work,
          "--format",
          "json",
        ],
        {
          cwd: tempDir(),
          env: { ...licEnv(), GITHUB_TOKEN: "good-token" },
        },
      );
      expect(out.code).toBe(0);
      const report = JSON.parse(out.stdout) as JsonReport & { org: string | null };
      expect(report.org).toBe("acme");
      expect(report.totals.repos).toBe(2);
      expect(report.groups.flatMap((g) => g.repos).map((r) => r.name).sort()).toEqual([
        "gh-a",
        "gh-b",
      ]);
      expect(report.skipped.map((s) => s.name)).toEqual(["gh-bad"]);
      expect(readdirSync(work).sort()).toEqual(["gh-a", "gh-b"]);
    } finally {
      await stub.close();
    }
  });

  it("AC-SO.8 denied token exits 2; max-repos truncates with note", async () => {
    const seed = tempDir();
    const specText = readFileSync(join(repoRoot, "fixtures", "petstore-mini.yaml"), "utf8");
    initGitRepo(join(seed, "gh-a-src"), "openapi.yaml", specText);
    const stub = await startGithubStub(
      [
        {
          repos: [
            { name: "gh-a", clone_url: pathToFileURL(join(seed, "gh-a-src")).href },
            { name: "gh-b", clone_url: pathToFileURL(join(seed, "gh-a-src")).href },
          ],
        },
      ],
      { requireToken: "good-token" },
    );
    try {
      const denied = await runCapture(
        ["scan-org", ".", "--github", "acme", "--api-base", stub.url],
        { cwd: tempDir(), env: { ...licEnv(), GITHUB_TOKEN: "bad-token" } },
      );
      expect(denied.code).toBe(2);
      expect(denied.stderr).toContain("github api denied");
      expect(denied.stderr).toContain("GITHUB_TOKEN");
    } finally {
      await stub.close();
    }

    const noToken = await runCapture(["scan-org", ".", "--github", "acme"], {
      cwd: tempDir(),
      env: licEnv(),
    });
    expect(noToken.code).toBe(2);
    expect(noToken.stderr).toContain("GITHUB_TOKEN");

    const paging = await startGithubStub([
      {
        repos: [
          { name: "gh-a", clone_url: pathToFileURL(join(seed, "gh-a-src")).href },
          { name: "gh-b", clone_url: pathToFileURL(join(seed, "gh-a-src")).href },
        ],
      },
    ]);
    try {
      const out = await runCapture(
        [
          "scan-org",
          ".",
          "--github",
          "acme",
          "--api-base",
          paging.url,
          "--workdir",
          tempDir(),
          "--max-repos",
          "1",
          "--format",
          "json",
        ],
        { cwd: tempDir(), env: { ...licEnv(), GITHUB_TOKEN: "t" } },
      );
      expect(out.code).toBe(0);
      expect(out.stderr).toContain("--max-repos 1");
      const report = JSON.parse(out.stdout) as JsonReport;
      expect(report.totals.repos).toBe(1);
    } finally {
      await paging.close();
    }
  });
});
