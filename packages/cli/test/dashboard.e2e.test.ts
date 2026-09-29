import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { loadReportFile, startDashboardServer, type DashboardPayload } from "../src/dashboard.js";
import { renderDashboardPage } from "../src/dashboard-page.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtures = join(repoRoot, "fixtures", "dashboard");
const smallReport = join(fixtures, "report-small.json");

const tempRoots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-dashboard-e2e-"));
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

function payloadFor(_trackingPath: string): DashboardPayload {
  const loaded = loadReportFile(smallReport);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error("fixture failed to load");
  return {
    report: loaded.report,
    tracking: { version: 1, states: {} },
    groups: {},
    trends: undefined,
  };
}

describe("dashboard server e2e (f10-dashboard)", () => {
  it("AC-DB.1 serves the page on loopback only", async () => {
    const dir = tempDir();
    const started = await startDashboardServer(
      {
        payload: () => payloadFor(join(dir, "t.json")),
        trackingPath: join(dir, "t.json"),
        pageHtml: renderDashboardPage(),
      },
      0,
    );
    try {
      expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const address = started.server.address();
      expect(typeof address === "object" && address !== null ? address.address : "").toBe(
        "127.0.0.1",
      );
      const res = await fetch(`${started.url}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Findings dashboard");
    } finally {
      await new Promise<void>((resolvePromise) => started.server.close(() => resolvePromise()));
    }
  });

  it("AC-DB.2 /api/report returns findings plus packs", async () => {
    const dir = tempDir();
    const started = await startDashboardServer(
      {
        payload: () => payloadFor(join(dir, "t.json")),
        trackingPath: join(dir, "t.json"),
        pageHtml: renderDashboardPage(),
      },
      0,
    );
    try {
      const res = await fetch(`${started.url}/api/report`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        report: { findings: unknown[]; score: { value: number } };
      };
      expect(body.report.findings).toHaveLength(5);
      expect(body.report.score.value).toBe(61);
    } finally {
      await new Promise<void>((resolvePromise) => started.server.close(() => resolvePromise()));
    }
  });

  it("AC-DB.3 POST /api/tracking persists to the explicit sidecar only", async () => {
    const dir = tempDir();
    const trackingPath = join(dir, "side.tracking.json");
    const started = await startDashboardServer(
      {
        payload: () => payloadFor(trackingPath),
        trackingPath,
        pageHtml: renderDashboardPage(),
      },
      0,
    );
    try {
      const before = readdirSync(dir).sort();
      const res = await fetch(`${started.url}/api/tracking`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint: "a".repeat(64), status: "in_progress" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
      const after = readdirSync(dir).sort();
      expect(after).toEqual([...before, "side.tracking.json"].sort());

      const bad = await fetch(`${started.url}/api/tracking`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint: "nope", status: "resolved" }),
      });
      expect(bad.status).toBe(422);

      const missing = await fetch(`${started.url}/nope`);
      expect(missing.status).toBe(404);
    } finally {
      await new Promise<void>((resolvePromise) => started.server.close(() => resolvePromise()));
    }
  });

  it("dashboard command rejects missing reports with exit 2", async () => {
    let stdout = "";
    let stderr = "";
    const code = await run(["node", "cli", "dashboard", join(tempDir(), "missing.json")], {
      stdout: (t) => {
        stdout += t;
      },
      stderr: (t) => {
        stderr += t;
      },
      isTTY: false,
    });
    expect(code).toBe(2);
    expect(stderr).toContain("report file not found");
    expect(stdout).toBe("");
  });
});
