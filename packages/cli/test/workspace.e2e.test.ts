import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startWorkspaceServer, type WorkspaceServer } from "../src/workspace.js";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { analyzeRunsDir } from "../src/workspace-runs.js";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-workspace-"));
  tempRoots.push(dir);
  return dir;
}

let server: WorkspaceServer | undefined;
let cwd: string;
let token = "";

function extractToken(html: string): string {
  const match = /var TOKEN = ("(?:[^"\\]|\\.)*");/.exec(html);
  if (match === null) throw new Error(`token not found in workspace page: ${html.slice(0, 300)}`);
  return JSON.parse(match[1]) as string;
}

async function fetchJson(
  path: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${server!.url}${path}`, init);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function requestRaw(
  options: { host?: string; origin?: string; tokenHeader?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: Number(new URL(server!.url).port),
        method: "POST",
        path: "/api/analyze/start",
        headers: {
          host: options.host ?? `127.0.0.1:${new URL(server!.url).port}`,
          ...(options.origin !== undefined ? { origin: options.origin } : {}),
          ...(options.tokenHeader !== undefined
            ? { "x-apigovscan-token": options.tokenHeader }
            : {}),
          "content-type": "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", rejectPromise);
    req.end(JSON.stringify({ path: "openapi.yaml" }));
  });
}

async function waitForRunState(
  terminal: ReadonlySet<string>,
  timeoutMs = 15000,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  for (;;) {
    const { body } = await fetchJson("/api/state");
    const run = body["run"] as Record<string, unknown> | null;
    if (run !== null && terminal.has(String(run["state"]))) return run;
    if (Date.now() - started > timeoutMs) throw new Error("run did not reach a terminal state");
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  cwd = tempDir();
  copyFileSync(petstore, join(cwd, "openapi.yaml"));
  server = await startWorkspaceServer({ cwd }, 0);
  const page = await (await fetch(`${server.url}/`)).text();
  token = extractToken(page);
});

afterAll(async () => {
  await server?.close();
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function authHeaders(): Record<string, string> {
  return { "x-apigovscan-token": token, "content-type": "application/json" };
}

describe("workspace server (f15 M15.3)", () => {
  it("AC-15.3 serves the app on loopback with no external resources", async () => {
    const res = await fetch(`${server!.url}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ApiGovScan workspace");
    expect(html).toContain('data-view="home"');
    expect(html).toContain('data-view="new"');
    expect(html).toContain('data-view="progress"');
    expect(html).toContain('data-view="result"');
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
    expect(html).not.toContain("cdn");
  });

  it("AC-15.4 exposes only allowlisted endpoints", async () => {
    const missing = await fetchJson("/api/shell");
    expect(missing.status).toBe(404);
    const missing2 = await fetchJson("/api/fs/read");
    expect(missing2.status).toBe(404);
    const catalog = await fetchJson("/api/catalog");
    expect(catalog.status).toBe(200);
    expect(catalog.body["ok"]).toBe(true);
    const operations = catalog.body["operations"] as Array<{ id: string; network: boolean }>;
    expect(operations.map((o) => o.id)).toEqual(["analyze"]);
    expect(operations[0]!.network).toBe(false);
  });

  it("AC-15.4 rejects mutations without a token and with a wrong token", async () => {
    const noToken = await requestRaw({});
    expect(noToken.status).toBe(403);
    expect(noToken.body).toContain("token");

    const badToken = await requestRaw({ tokenHeader: "not-the-token" });
    expect(badToken.status).toBe(403);
  });

  it("AC-15.4 rejects invalid Host and cross-origin requests", async () => {
    const badHost = await requestRaw({ host: "evil.example:8080", tokenHeader: token });
    expect(badHost.status).toBe(403);
    expect(badHost.body).toContain("Host");

    const crossOrigin = await requestRaw({
      origin: "http://evil.example",
      tokenHeader: token,
    });
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.body).toContain("Origin");
  });

  it("validates input before starting and reports honest errors", async () => {
    const missing = await fetchJson("/api/analyze/start", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ path: "does-not-exist.yaml" }),
    });
    expect(missing.status).toBe(422);
    expect(missing.body["error"]).toContain("input not found");

    const badFailOn = await fetchJson("/api/analyze/start", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ path: "openapi.yaml", failOn: "always" }),
    });
    expect(badFailOn.status).toBe(422);

    const noPath = await fetchJson("/api/analyze/start", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(noPath.status).toBe(422);
  });

  it("cancel without a run or after completion answers honestly, never fake states", async () => {
    const noRun = await fetchJson("/api/analyze/cancel", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(noRun.status).toBe(409);
    expect(noRun.body["error"]).toContain("no run in progress");
  });

  it("AC-15.6 runs analyze with real progress and parity with the CLI report", async () => {
    const start = await fetchJson("/api/analyze/start", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ path: "openapi.yaml", failOn: "never" }),
    });
    expect(start.status).toBe(200);
    expect(start.body["ok"]).toBe(true);

    const runState = await waitForRunState(new Set(["succeeded", "failed", "cancelled"]));
    expect(runState["state"]).toBe("succeeded");
    expect(runState["operation"]).toBe("analyze");
    expect(typeof runState["id"]).toBe("string");

    const result = await fetchJson("/api/result");
    expect(result.status).toBe(200);
    const report = result.body["report"] as {
      summary: { total: number };
      reportHash: string;
      input: Array<{ path: string }>;
    };
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.input.map((i) => i.path)).toEqual(["openapi.yaml"]);

    let cliStdout = "";
    const code = await run(["node", "cli", "analyze", "openapi.yaml", "--format", "json"], {
      stdout: (t) => {
        cliStdout += t;
      },
      stderr: () => {},
      env: { APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY },
      cwd,
      isTTY: false,
    });
    expect([0, 1]).toContain(code);
    const cliReport = JSON.parse(cliStdout) as { reportHash: string };
    expect(report.reportHash).toBe(cliReport.reportHash);
  });

  it("cancel after completion answers honestly with the finished state", async () => {
    const done = await fetchJson("/api/analyze/cancel", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(done.status).toBe(409);
    expect(done.body["error"]).toContain("already finished");
    expect((done.body["state"] as Record<string, unknown>)["state"]).toBe("succeeded");
  });

  it("analyze failures surface as failed state with the error, never as success", async () => {
    writeFileSync(join(cwd, "broken.yaml"), "openapi: [not: valid\n", "utf8");
    const start = await fetchJson("/api/analyze/start", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ path: "broken.yaml" }),
    });
    expect(start.status).toBe(200);

    const runState = await waitForRunState(new Set(["succeeded", "failed", "cancelled"]));
    expect(runState["state"]).toBe("failed");
    expect(String(runState["error"])).toContain("failed to parse");

    const result = await fetchJson("/api/result");
    expect(result.status).toBe(409);
    expect(result.body["error"]).toContain("failed");
  });
});

describe("workspace command (f15 M15.3)", () => {
  async function runCapture(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
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
    });
    return { code, stdout, stderr };
  }

  it("workspace --help exits 0 and documents the command", async () => {
    const result = await runCapture(["workspace", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("usage: apigovscan workspace [--port <n>]");
    expect(result.stdout).toContain("127.0.0.1");
  });

  it("rejects invalid ports and unknown options with exit 2", async () => {
    const badPort = await runCapture(["workspace", "--port", "abc"]);
    expect(badPort.code).toBe(2);
    expect(badPort.stderr).toContain("not a valid port");

    const unknown = await runCapture(["workspace", "--turbo"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("unknown option");
  });
});

describe("workspace history and compare (f15 M15.4, AC-15.9/.11)", () => {
  let server2: WorkspaceServer;
  let cwd2: string;
  let token2 = "";

  async function fetch2(
    path: string,
    init?: RequestInit & { headers?: Record<string, string> },
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${server2.url}${path}`, init);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function start2(path: string): Promise<void> {
    const res = await fetch2("/api/analyze/start", {
      method: "POST",
      headers: { "x-apigovscan-token": token2, "content-type": "application/json" },
      body: JSON.stringify({ path, failOn: "never" }),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  async function waitForRuns(count: number): Promise<void> {
    const started = Date.now();
    for (;;) {
      const { body } = await fetch2("/api/runs");
      if (((body["runs"] as unknown[]) ?? []).length >= count) return;
      if (Date.now() - started > 15000) throw new Error(`history did not reach ${count} runs`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  beforeAll(async () => {
    cwd2 = tempDir();
    copyFileSync(petstore, join(cwd2, "openapi.yaml"));
    writeFileSync(
      join(cwd2, "leaky.yaml"),
      [
        "openapi: 3.1.0",
        "info:",
        "  title: Leaky",
        "  version: 1.0.0",
        "  description: XMARKERX-DO-NOT-PERSIST internal notes",
        "paths:",
        "  /items:",
        "    get:",
        "      operationId: listItems",
        "      responses:",
        '        "200":',
        "          description: OK",
        "",
      ].join("\n"),
      "utf8",
    );
    server2 = await startWorkspaceServer({ cwd: cwd2 }, 0);
    const page = await (await fetch(`${server2.url}/`)).text();
    token2 = extractToken(page);
  });

  afterAll(async () => {
    await server2.close();
  });

  it("persists runs with full results and lists them without bodies (AC-15.9/.11)", async () => {
    await start2("openapi.yaml");
    await waitForRuns(1);

    const listed = await fetch2("/api/runs");
    expect(listed.body["ok"]).toBe(true);
    const runs = listed.body["runs"] as Array<Record<string, unknown>>;
    expect(runs.length).toBe(1);
    expect(runs[0]!["state"]).toBe("succeeded");
    expect(runs[0]!["source"]).toBe("openapi.yaml");
    expect(typeof runs[0]!["reportHash"]).toBe("string");
    expect(runs[0]!["summary"]).toMatchObject({ total: expect.any(Number) });
    expect(runs[0]!["report"]).toBeUndefined();

    const opened = await fetch2("/api/runs/run-1");
    expect(opened.status).toBe(200);
    const runPayload = opened.body["run"] as Record<string, unknown>;
    const report = runPayload["report"] as { reportHash: string; summary: { total: number } };
    expect(report.summary.total).toBeGreaterThan(0);
    expect(runPayload["reportHash"]).toBe(report.reportHash);
    expect(existsSync(join(analyzeRunsDir(cwd2), "run-1.json"))).toBe(true);

    const runFile = readFileSync(join(analyzeRunsDir(cwd2), "run-1.json"), "utf8");
    expect(runFile).toContain('"source": "openapi.yaml"');
    expect(runFile).not.toContain("XMARKERX-DO-NOT-PERSIST");
  });

  it("does not persist spec bodies from analyzed contracts (AC-15.11)", async () => {
    await start2("leaky.yaml");
    await waitForRuns(2);
    const runFile = readFileSync(join(analyzeRunsDir(cwd2), "run-2.json"), "utf8");
    expect(runFile).not.toContain("XMARKERX-DO-NOT-PERSIST");
  });

  it("compares two compatible runs by fingerprint with explicit deltas (AC-15.9)", async () => {
    const original = readFileSync(join(cwd2, "openapi.yaml"), "utf8");
    writeFileSync(
      join(cwd2, "openapi.yaml"),
      original.replace(
        "paths:",
        [
          "paths:",
          "  /user:",
          "    get:",
          "      operationId: getUser",
          "      responses:",
          '        "200":',
          "          description: OK",
          "",
        ].join("\n"),
      ),
      "utf8",
    );
    await start2("openapi.yaml");
    await waitForRuns(3);

    const compared = await fetch2("/api/compare?left=run-1&right=run-3");
    expect(compared.status).toBe(200);
    expect(compared.body["ok"]).toBe(true);
    const summary = compared.body["summary"] as Record<string, number>;
    expect(summary["newCount"]).toBeGreaterThan(0);
    const newFindings = compared.body["newFindings"] as Array<{ ruleId: string }>;
    expect(newFindings.map((f) => f.ruleId)).toContain("NAMING-001");
    expect(Array.isArray(compared.body["resolvedFingerprints"])).toBe(true);

    writeFileSync(join(cwd2, "openapi.yaml"), original, "utf8");
  });

  it("rejects comparisons with missing results or different inputs, never clean (AC-15.9)", async () => {
    writeFileSync(join(cwd2, "broken.yaml"), "openapi: [not: valid\n", "utf8");
    await start2("broken.yaml");
    await waitForRuns(4);
    const failedRun = (await fetch2("/api/runs")).body["runs"] as Array<Record<string, unknown>>;
    const failed = failedRun.find((r) => r["state"] === "failed");
    expect(failed).toBeDefined();

    const noResult = await fetch2(`/api/compare?left=run-1&right=${failed!["id"]}`);
    expect(noResult.status).toBe(409);
    expect(noResult.body["error"]).toContain("has no result to compare");
    expect(noResult.body["error"]).toContain("failed");

    const differentInputs = await fetch2("/api/compare?left=run-1&right=run-2");
    expect(differentInputs.status).toBe(409);
    expect(differentInputs.body["error"]).toContain("different inputs");

    const unknown = await fetch2("/api/compare?left=run-1&right=run-999");
    expect(unknown.status).toBe(404);
    expect(unknown.body["error"]).toContain("run not found");

    const traversal = await fetch2("/api/runs/..%2Fescape");
    expect(traversal.status).toBe(404);
    expect(traversal.body["error"]).toContain("invalid run id");
  });

  it("skips unreadable run files honestly and survives restarts (AC-15.9)", async () => {
    writeFileSync(join(analyzeRunsDir(cwd2), "garbage.json"), "{not json", "utf8");
    const listed = await fetch2("/api/runs");
    expect(listed.body["ok"]).toBe(true);
    expect(listed.body["invalidFiles"]).toBe(1);
    expect((listed.body["runs"] as unknown[]).length).toBeGreaterThanOrEqual(4);

    await server2.close();
    server2 = await startWorkspaceServer({ cwd: cwd2 }, 0);
    const page = await (await fetch(`${server2.url}/`)).text();
    token2 = extractToken(page);
    const afterRestart = await fetch2("/api/runs");
    expect((afterRestart.body["runs"] as unknown[]).length).toBeGreaterThanOrEqual(4);
  });
});
