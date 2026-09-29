import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, resolve } from "node:path";
import { loadGroupMapping } from "./scan.js";

export type TrackingStatus = "pending" | "in_progress" | "resolved";

export interface TrackingState {
  status: TrackingStatus;
  note?: string;
}

export interface TrackingFile {
  version: 1;
  states: Record<string, TrackingState>;
}

export interface DashboardFinding {
  ruleId: string;
  severity: string;
  category: string;
  message: string;
  location: string;
  apiLocation?: string;
  fix?: string;
  source?: { title: string; url: string; section?: string };
  packId: string;
  packVersion: string;
  fingerprint: string;
}

export interface DashboardReport {
  tool?: { name: string; version: string };
  packs: Array<{ id: string; version: string }>;
  input: Array<{ path: string }>;
  findings: DashboardFinding[];
  summary: { error: number; warning: number; info: number; total: number };
  score?: { value: number; grade: string };
  reportHash: string;
}

export type Trend = "new" | "repeated";

export interface TrendInfo {
  byFingerprint: Record<string, Trend>;
  resolved: string[];
}

const TRACKING_STATUSES: ReadonlySet<string> = new Set(["pending", "in_progress", "resolved"]);

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

export function defaultTrackingPath(reportPath: string): string {
  return `${reportPath}.tracking.json`;
}

export function emptyTracking(): TrackingFile {
  return { version: 1, states: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadReportFile(
  path: string,
): { ok: true; report: DashboardReport } | { ok: false; error: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {
      ok: false,
      error: `report file not found: ${path}`,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: `report file is not valid JSON: ${path} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
  if (!isRecord(raw) || !Array.isArray(raw["findings"]) || !isRecord(raw["summary"])) {
    return {
      ok: false,
      error: `report file is not an apigovscan report: ${path} (missing findings/summary)`,
    };
  }
  return { ok: true, report: raw as unknown as DashboardReport };
}

export function loadTrackingFile(
  path: string,
): { ok: true; tracking: TrackingFile } | { ok: false; error: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { ok: true, tracking: emptyTracking() };
    }
    return {
      ok: false,
      error: `cannot read tracking file: ${path}`,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: `tracking file is not valid JSON: ${path}` };
  }
  if (!isRecord(raw) || !isRecord(raw["states"])) {
    return { ok: false, error: `tracking file is not a tracking file: ${path}` };
  }
  const states: Record<string, TrackingState> = {};
  for (const [fp, entry] of Object.entries(raw["states"] as Record<string, unknown>)) {
    if (!isRecord(entry) || !TRACKING_STATUSES.has(String(entry["status"]))) {
      return {
        ok: false,
        error: `tracking file has an invalid entry for ${fp} in ${path}`,
      };
    }
    const state: TrackingState = {
      status: entry["status"] as TrackingStatus,
    };
    if (typeof entry["note"] === "string") {
      state.note = entry["note"].slice(0, 500);
    }
    states[fp] = state;
  }
  return { ok: true, tracking: { version: 1, states } };
}

export function saveTrackingFile(
  path: string,
  tracking: TrackingFile,
): { ok: true } | { ok: false; error: string } {
  try {
    writeFileSync(path, `${JSON.stringify(tracking, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `cannot write tracking file: ${path} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

export function setFindingStatus(
  tracking: TrackingFile,
  fingerprint: string,
  status: TrackingStatus,
  note?: string,
): TrackingFile {
  const states: Record<string, TrackingState> = {
    ...tracking.states,
    [fingerprint]: {
      status,
      ...(note !== undefined && note.length > 0 ? { note: note.slice(0, 500) } : {}),
    },
  };
  return { version: 1, states };
}

export function compareReports(current: DashboardReport, previous: DashboardReport): TrendInfo {
  const prev = new Set(previous.findings.map((f) => f.fingerprint));
  const byFingerprint: Record<string, Trend> = {};
  for (const f of current.findings) {
    byFingerprint[f.fingerprint] = prev.has(f.fingerprint) ? "repeated" : "new";
  }
  const curr = new Set(current.findings.map((f) => f.fingerprint));
  const resolved = previous.findings
    .map((f) => f.fingerprint)
    .filter((fp) => !curr.has(fp))
    .sort();
  return { byFingerprint, resolved };
}

export function loadOwnerMapping(
  text: string,
): { ok: true; mapping: Record<string, string> } | { ok: false; error: string } {
  return loadGroupMapping(text);
}

export function ownerOf(
  finding: DashboardFinding,
  mapping: Record<string, string> | undefined,
  inputs: string[] = [],
): string {
  if (mapping === undefined) return "ungrouped";
  const loc = finding.location;
  const candidates: string[] = [];
  const split = loc.indexOf("##");
  if (split >= 0) candidates.push(loc.slice(0, split));
  for (const key of Object.keys(mapping)) {
    if (loc === key || loc.startsWith(`${key}#`) || loc.startsWith(`${key}/`)) {
      candidates.push(key);
    }
  }
  if (inputs.length === 1 && inputs[0] !== undefined) candidates.push(inputs[0]);
  for (const candidate of candidates) {
    if (candidate in mapping) return mapping[candidate] as string;
    const base = basename(candidate);
    if (base in mapping) return mapping[base] as string;
  }
  return "ungrouped";
}

export interface DashboardPayload {
  report: DashboardReport;
  tracking: TrackingFile;
  groups: Record<string, string>;
  trends: TrendInfo | undefined;
}

const MAX_BODY_BYTES = 256_000;

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

export interface DashboardServerOptions {
  payload: () => DashboardPayload;
  trackingPath: string;
  pageHtml: string;
}

export interface DashboardServer {
  server: Server;
  url: string;
}

export function startDashboardServer(
  opts: DashboardServerOptions,
  port: number,
): Promise<DashboardServer> {
  const server = createServer((req, res) => {
    void handleRequest(req, res, opts).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ ok: false, error: "internal error" }));
    });
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address !== null ? address.port : port;
      resolvePromise({
        server,
        url: `http://127.0.0.1:${actual}`,
      });
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: DashboardServerOptions,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(opts.pageHtml);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/report") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(opts.payload()));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/tracking") {
    const loaded = loadTrackingFile(opts.trackingPath);
    if (!loaded.ok) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: loaded.error }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tracking: loaded.tracking }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/tracking") {
    let text: string;
    try {
      text = await readBody(req);
    } catch {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "body too large" }));
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      res.writeHead(422, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid JSON body" }));
      return;
    }
    if (!isRecord(body) || typeof body["fingerprint"] !== "string") {
      res.writeHead(422, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "fingerprint is required" }));
      return;
    }
    if (!FINGERPRINT_RE.test(body["fingerprint"] as string)) {
      res.writeHead(422, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid fingerprint format" }));
      return;
    }
    if (!TRACKING_STATUSES.has(String(body["status"]))) {
      res.writeHead(422, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: false, error: "status must be pending, in_progress or resolved" }),
      );
      return;
    }
    const note = typeof body["note"] === "string" ? body["note"].slice(0, 500) : undefined;
    const loaded = loadTrackingFile(opts.trackingPath);
    if (!loaded.ok) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: loaded.error }));
      return;
    }
    const next = setFindingStatus(
      loaded.tracking,
      body["fingerprint"] as string,
      body["status"] as TrackingStatus,
      note,
    );
    const saved = saveTrackingFile(opts.trackingPath, next);
    if (!saved.ok) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: saved.error }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tracking: next }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
}

export function dashboardHelp(): string {
  return [
    "usage: apigovscan dashboard <report.json> [--port <n>] [--tracking <file>] [--against <old.json>] [--group-by <file>]",
    "",
    "Serve a local read-only viewer for a report on 127.0.0.1.",
    "Tracking states persist to <report.json>.tracking.json unless --tracking is given.",
  ].join("\n");
}

export function resolveDashboardPaths(
  cwd: string,
  report: string,
  tracking?: string,
): {
  reportPath: string;
  trackingPath: string;
} {
  const reportPath = resolve(cwd, report);
  return {
    reportPath,
    trackingPath: tracking !== undefined ? resolve(cwd, tracking) : defaultTrackingPath(reportPath),
  };
}
