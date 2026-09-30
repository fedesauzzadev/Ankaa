import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isAbsolute, resolve } from "node:path";
import { packageVersion, type Rule } from "@apigovscan/core";
import type { Report } from "@apigovscan/reporters";
import { analyzeUseCase } from "./analyze.js";
import { ANALYZE_OPERATION, type AnalyzeProgressPhase, type OperationState } from "./operations.js";
import { prepareAnalysis } from "./analyze-setup.js";
import { loadConfig } from "./config.js";
import { discoverSpecs } from "./discovery.js";
import { createFsPackRepository, createFsSpecLoader } from "./loaders.js";
import { renderWorkspacePage } from "./workspace-page.js";

const MAX_BODY_BYTES = 8_192;
const FAIL_ON_VALUES = new Set(["error", "warning", "info", "never"]);
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export interface WorkspaceRunState {
  id: string;
  operation: "analyze";
  state: OperationState;
  startedAt: string;
  finishedAt?: string;
  phase?: AnalyzeProgressPhase;
  completed?: number;
  total?: number;
  item?: string;
  error?: string;
}

export interface WorkspaceServerOptions {
  cwd: string;
}

export interface WorkspaceServer {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLabel(absPath: string, cwd: string): string {
  const rel = absPath.startsWith(cwd)
    ? absPath.slice(cwd.length).replace(/^[\\/]+/, "")
    : absPath;
  return rel.split("\\").join("/");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejectBody(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rejectBody);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

interface ActiveRun {
  state: WorkspaceRunState;
  report?: Report;
  controller: AbortController;
  done: Promise<void>;
}

export function startWorkspaceServer(opts: WorkspaceServerOptions, port: number): Promise<WorkspaceServer> {
  const token = randomBytes(24).toString("hex");
  let runCounter = 0;
  let active: ActiveRun | undefined;

  function guard(req: IncomingMessage, res: ServerResponse, mutation: boolean): boolean {
    const host = req.headers.host ?? "";
    const hostname = host.replace(/:\d+$/, "").toLowerCase();
    if (!LOCAL_HOSTNAMES.has(hostname)) {
      json(res, 403, { ok: false, error: "invalid Host" });
      return false;
    }
    const origin = req.headers.origin;
    if (origin !== undefined) {
      try {
        const originHost = new URL(origin).host.replace(/:\d+$/, "").toLowerCase();
        if (!LOCAL_HOSTNAMES.has(originHost) || !new URL(origin).protocol.startsWith("http")) {
          json(res, 403, { ok: false, error: "invalid Origin" });
          return false;
        }
      } catch {
        json(res, 403, { ok: false, error: "invalid Origin" });
        return false;
      }
    }
    if (mutation && req.headers["x-apigovscan-token"] !== token) {
      json(res, 403, { ok: false, error: "missing or invalid workspace token" });
      return false;
    }
    return true;
  }

  function currentState(): WorkspaceRunState & { hasReport: boolean } {
    if (active === undefined) {
      return { id: "", operation: "analyze", state: "queued", startedAt: "", hasReport: false };
    }
    return { ...active.state, hasReport: active.report !== undefined };
  }

  function startAnalyze(res: ServerResponse, body: unknown): void {
    if (active !== undefined && (active.state.state === "running" || active.state.state === "queued")) {
      json(res, 409, { ok: false, error: "a run is already in progress", state: currentState() });
      return;
    }
    if (!isRecord(body) || typeof body["path"] !== "string" || body["path"].length === 0) {
      json(res, 422, { ok: false, error: "path is required (a local file or directory)" });
      return;
    }
    const failOnRaw = body["failOn"];
    if (failOnRaw !== undefined && (typeof failOnRaw !== "string" || !FAIL_ON_VALUES.has(failOnRaw))) {
      json(res, 422, { ok: false, error: "failOn must be error, warning, info or never" });
      return;
    }
    const typedPath = body["path"] as string;
    if (typedPath === "-") {
      json(res, 422, { ok: false, error: "stdin is not supported here; pass a file or directory" });
      return;
    }
    const abs = isAbsolute(typedPath) ? typedPath : resolve(opts.cwd, typedPath);
    if (!existsSync(abs)) {
      json(res, 422, { ok: false, error: `input not found: ${typedPath}` });
      return;
    }
    if (!statSync(abs).isFile() && !statSync(abs).isDirectory()) {
      json(res, 422, { ok: false, error: `not a file or directory: ${typedPath}` });
      return;
    }

    const configResult = loadConfig(opts.cwd, undefined);
    if (!configResult.ok) {
      json(res, 500, { ok: false, error: configResult.error });
      return;
    }
    const config = configResult.config;
    const prepared = prepareAnalysis(opts.cwd, config, {
      rulesFiles: [],
      baselineMode: config.baseline?.enabled === true ? "read" : "off",
    });
    if (!prepared.ok) {
      json(res, 500, { ok: false, error: prepared.error });
      return;
    }
    const setup = prepared.setup;

    let inputs: string[];
    if (statSync(abs).isDirectory()) {
      const discovered = discoverSpecs(abs);
      if (!discovered.ok) {
        json(res, 422, { ok: false, error: discovered.error });
        return;
      }
      inputs = discovered.paths.map((p) => resolve(abs, p));
      if (inputs.length === 0) {
        json(res, 422, { ok: false, error: `no specs found in ${typedPath}` });
        return;
      }
    } else {
      inputs = [abs];
    }

    runCounter += 1;
    const controller = new AbortController();
    const state: WorkspaceRunState = {
      id: `run-${runCounter}`,
      operation: "analyze",
      state: "running",
      startedAt: new Date().toISOString(),
    };
    const run: ActiveRun = { state, controller, done: Promise.resolve() };
    active = run;
    const failOn = (failOnRaw ?? config.failOn ?? "error") as "error" | "warning" | "info" | "never";

    run.done = (async () => {
      const outcome = await analyzeUseCase(
        {
          loader: createFsSpecLoader(),
          packs: createFsPackRepository(opts.cwd),
          sink: { async write() {} },
        },
        {
          inputs,
          labelFor: (p) => normalizeLabel(p, opts.cwd),
          failOn,
          customRules: setup.customRules as Rule[] | undefined,
          disabledRuleIds: setup.disabledRuleIds,
          severityOverrides: setup.severityOverrides,
          skillsSuppressions: setup.skillsSuppressions,
          baselineFingerprints: setup.baselineFingerprints,
          toolVersion: packageVersion(),
          operation: {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.type === "state") {
                state.state = event.state;
                if (event.state !== "running" && event.state !== "queued") {
                  state.finishedAt = new Date().toISOString();
                }
                if (event.state === "cancelled") {
                  state.error = "analysis cancelled";
                }
                return;
              }
              state.phase = event.phase;
              state.completed = event.completed;
              state.total = event.total;
              if (event.item !== undefined) state.item = event.item;
            },
          },
        },
      );
      if (outcome.ok) {
        run.report = outcome.report;
        state.state = "succeeded";
      } else if (outcome.cancelled === true) {
        state.state = "cancelled";
        state.error = "analysis cancelled";
      } else {
        state.state = "failed";
        state.error = outcome.error;
      }
      state.finishedAt = new Date().toISOString();
    })();

    json(res, 200, { ok: true, runId: state.id });
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      if (!res.headersSent) {
        json(res, 500, { ok: false, error: "internal error" });
      } else {
        res.end();
      }
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    if (req.method === "GET" && path === "/") {
      if (!guard(req, res, false)) return;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(renderWorkspacePage(token));
      return;
    }
    if (req.method === "GET" && path === "/api/catalog") {
      if (!guard(req, res, false)) return;
      json(res, 200, {
        ok: true,
        operations: [ANALYZE_OPERATION],
        upcoming: ["review", "scan-repo", "scan-org", "compare", "prepare-ci"],
      });
      return;
    }
    if (req.method === "GET" && path === "/api/state") {
      if (!guard(req, res, false)) return;
      json(res, 200, { ok: true, run: active === undefined ? null : currentState() });
      return;
    }
    if (req.method === "GET" && path === "/api/result") {
      if (!guard(req, res, false)) return;
      if (active === undefined) {
        json(res, 409, { ok: false, error: "no run yet" });
        return;
      }
      if (active.report === undefined) {
        json(res, 409, { ok: false, error: `run ${active.state.id} is ${active.state.state}`, state: currentState() });
        return;
      }
      json(res, 200, { ok: true, report: active.report });
      return;
    }
    if (req.method === "POST" && path === "/api/analyze/start") {
      if (!guard(req, res, true)) return;
      let text: string;
      try {
        text = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: "body too large" });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        json(res, 422, { ok: false, error: "invalid JSON body" });
        return;
      }
      startAnalyze(res, body);
      return;
    }
    if (req.method === "POST" && path === "/api/analyze/cancel") {
      if (!guard(req, res, true)) return;
      if (active === undefined) {
        json(res, 409, { ok: false, error: "no run in progress" });
        return;
      }
      if (active.state.state !== "running" && active.state.state !== "queued") {
        json(res, 409, {
          ok: false,
          error: `run ${active.state.id} already finished (${active.state.state})`,
          state: currentState(),
        });
        return;
      }
      active.controller.abort();
      json(res, 200, { ok: true, runId: active.state.id });
      return;
    }
    json(res, 404, { ok: false, error: "not found" });
  }

  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", (err: unknown) => {
      const code =
        typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
      if (code === "EADDRINUSE") {
        rejectPromise(new Error(`port ${port} is already in use (try --port 0 for an ephemeral port)`));
        return;
      }
      rejectPromise(err);
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address !== null ? address.port : port;
      resolvePromise({
        server,
        url: `http://127.0.0.1:${actual}`,
        close: () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
            setTimeout(() => resolveClose(), 1000).unref?.();
          }),
      });
    });
  });
}

export function workspaceHelp(): string {
  return [
    "usage: apigovscan workspace [--port <n>]",
    "",
    "Serve the guided local workspace app on 127.0.0.1 (ephemeral port by default).",
    "Runs typed ApiGovScan operations (analyze) with live progress; loopback only,",
    "token-protected mutations, no external resources. Ctrl+C to stop.",
  ].join("\n");
}
