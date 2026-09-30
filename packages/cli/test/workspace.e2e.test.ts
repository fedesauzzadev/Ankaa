import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startWorkspaceServer, type WorkspaceServer } from "../src/workspace.js";
import { DEV_LICENSE_KEY } from "../src/license.js";
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
