import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { redactText } from "@apigovscan/reporters";
import type { ChatMessage } from "./llm.js";
import { detectRoutes, type DetectedRoute } from "./route-signatures.js";

export interface Endpoint {
  method: string;
  path: string;
}

export interface EndpointChange {
  path: string;
  specMethods: string[];
  codeMethods: string[];
}

export interface ShapeNote {
  op: string;
  outputChanged: boolean;
  confidence: "low" | "medium" | "high";
  note: string;
}

export interface DriftReport {
  missing: Endpoint[];
  removed: Endpoint[];
  changed: EndpointChange[];
  shapeNotes: ShapeNote[];
}

export const MAX_SWEEP_FILES = 500;
export const MAX_SWEEP_BYTES = 5_000_000;
export const MAX_SWEEP_LIST_CHARS = 6000;
export const MAX_SHAPE_PAIRS = 8;
export const MAX_FRAGMENT_CHARS = 1500;

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".java",
  ".cs",
  ".py",
  ".rb",
  ".go",
  ".php",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".apigovscan",
]);

function byEndpoint(a: Endpoint, b: Endpoint): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.method !== b.method) return a.method < b.method ? -1 : 1;
  return 0;
}

export function compareEndpoints(
  specOps: Array<{ method: string; path: string }>,
  codeRoutes: DetectedRoute[],
): DriftReport {
  const specKeys = new Map<string, { method: string; path: string }>();
  for (const op of specOps) {
    const method = op.method.toUpperCase();
    specKeys.set(`${method} ${op.path}`, { method, path: op.path });
  }
  const specPaths = new Map<string, Set<string>>();
  for (const { method, path } of specKeys.values()) {
    const set = specPaths.get(path) ?? new Set<string>();
    set.add(method);
    specPaths.set(path, set);
  }

  const codeKeys = new Map<string, { method: string; path: string }>();
  for (const route of codeRoutes) {
    const method = route.method.toUpperCase();
    codeKeys.set(`${method} ${route.path}`, { method, path: route.path });
  }

  const codePaths = new Set<string>();
  for (const { path } of codeKeys.values()) {
    codePaths.add(path);
  }

  const missing: Endpoint[] = [];
  for (const endpoint of specKeys.values()) {
    if (!codePaths.has(endpoint.path)) {
      missing.push(endpoint);
    }
  }

  const removed: Endpoint[] = [];
  for (const endpoint of codeKeys.values()) {
    if (!specPaths.has(endpoint.path)) {
      removed.push(endpoint);
    }
  }

  const changed: EndpointChange[] = [];
  const codeMethodSets = new Map<string, Set<string>>();
  for (const { method, path } of codeKeys.values()) {
    if (method === "*") continue;
    const set = codeMethodSets.get(path) ?? new Set<string>();
    set.add(method);
    codeMethodSets.set(path, set);
  }
  for (const [path, specSet] of specPaths) {
    const codeSet = codeMethodSets.get(path);
    if (codeSet === undefined || codeSet.size === 0) continue;
    const specMethods = [...specSet].sort();
    const methods = [...codeSet].sort();
    const same =
      specMethods.length === methods.length &&
      specMethods.every((m, i) => m === methods[i]);
    if (!same) {
      changed.push({ path, specMethods, codeMethods: methods });
    }
  }

  missing.sort(byEndpoint);
  removed.sort(byEndpoint);
  changed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { missing, removed, changed, shapeNotes: [] };
}

export interface CollectedSources {
  files: string[];
  routes: DetectedRoute[];
  truncated: boolean;
  skippedUnreadable: number;
}

export function collectSourceFiles(
  dir: string,
  readFile: (path: string) => string | undefined,
  maxFiles: number = MAX_SWEEP_FILES,
  maxBytes: number = MAX_SWEEP_BYTES,
): CollectedSources {
  const all: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current).sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(current, entry);
      let isDir = false;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (!SKIP_DIRS.has(entry)) stack.push(abs);
        continue;
      }
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : "";
      if (SOURCE_EXTENSIONS.has(ext)) all.push(abs);
    }
  }
  all.sort();
  const files: string[] = [];
  const routes: DetectedRoute[] = [];
  let bytes = 0;
  let truncated = false;
  let skippedUnreadable = 0;
  for (const abs of all) {
    if (files.length >= maxFiles || bytes >= maxBytes) {
      truncated = true;
      break;
    }
    const rel = relative(dir, abs).split("\\").join("/");
    const content = readFile(abs);
    if (content === undefined) {
      skippedUnreadable++;
      continue;
    }
    bytes += content.length;
    files.push(rel);
    routes.push(...detectRoutes(rel, content));
  }
  return { files, routes, truncated, skippedUnreadable };
}

function toOperationId(method: string, path: string): string {
  const parts = path
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => {
      const param = s.match(/^\{(.+)\}$/);
      if (param?.[1] !== undefined) {
        const name = param[1];
        return `By${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
      }
      return s.slice(0, 1).toUpperCase() + s.slice(1);
    });
  const base = parts.length > 0 ? parts.join("") : "Root";
  return `${method.toLowerCase()}${base}`;
}

export function buildSpecSkeleton(
  routes: DetectedRoute[],
  sourceLabel: string,
): string {
  const byPath = new Map<string, Set<string>>();
  for (const route of routes) {
    if (route.method === "*") continue;
    const set = byPath.get(route.path) ?? new Set<string>();
    set.add(route.method.toUpperCase());
    byPath.set(route.path, set);
  }
  const paths: Record<string, unknown> = {};
  for (const path of [...byPath.keys()].sort()) {
    const methods = [...byPath.get(path)!].sort();
    const operations: Record<string, unknown> = {};
    for (const method of methods) {
      operations[method.toLowerCase()] = {
        operationId: toOperationId(method, path),
        summary: "TODO",
        responses: {
          default: { description: "Drafted by apigovscan drift" },
        },
      };
    }
    paths[path] = operations;
  }
  return (
    `# Drafted by apigovscan drift from ${sourceLabel} — review before use\n` +
    stringifyYaml({
      openapi: "3.1.0",
      info: { title: "Draft API", version: "0.1.0-draft" },
      paths,
    })
  );
}

function coerceConfidence(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "low";
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?[ \t]*\r?\n?/gim, "")
    .replace(/```[ \t]*$/gm, "")
    .trim();
}

export function parseSweepResponse(text: string): DetectedRoute[] {
  const cleaned = stripFences(text);
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const routes: DetectedRoute[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const method =
      typeof record.method === "string" && record.method.length > 0
        ? record.method.toUpperCase()
        : undefined;
    const path =
      typeof record.path === "string" && record.path.startsWith("/")
        ? record.path
        : undefined;
    if (method === undefined || path === undefined) continue;
    routes.push({
      method,
      path,
      file: typeof record.file === "string" ? record.file : "unknown",
      framework: "llm-sweep",
    });
  }
  return routes;
}

export function buildSweepMessages(files: string[]): ChatMessage[] {
  const joined = files.join("\n");
  const list =
    joined.length > MAX_SWEEP_LIST_CHARS
      ? `${joined.slice(0, MAX_SWEEP_LIST_CHARS)}\n... (truncated)`
      : joined;
  return [
    {
      role: "system",
      content: [
        "You map source files to API routes for an unknown web framework.",
        'Respond with ONLY a valid JSON array: [{"method": "GET"|"POST"|..., "path": "/pets/{id}", "confidence": "low"|"medium"|"high", "file": "<path>"}].',
        'Use method "*" when the HTTP method cannot be determined. Paths must start with "/".',
        "Only include routes you can ground in the file list; never invent files.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `Candidate source files:\n${list}`,
    },
  ];
}

export interface ShapePair {
  op: string;
  specFragment: string;
  codeFragment: string;
}

export function buildShapeMessages(pairs: ShapePair[]): ChatMessage[] {
  const blocks = pairs.map(
    (p) =>
      `### ${p.op}\nSPEC (redacted):\n${redactText(p.specFragment)}\nCODE (redacted):\n${redactText(p.codeFragment)}`,
  );
  return [
    {
      role: "system",
      content: [
        "You compare an OpenAPI operation against its handler code.",
        'Respond with ONLY a valid JSON array: [{"op": "<same op string>", "outputChanged": true|false, "confidence": "low"|"medium"|"high", "note": "<1 sentence>"}].',
        "outputChanged is true only when the response shape clearly differs. When unsure, answer false with low confidence.",
      ].join("\n"),
    },
    { role: "user", content: blocks.join("\n\n") },
  ];
}

export interface ParsedShapeNote {
  op: string;
  outputChanged: boolean;
  confidence: "low" | "medium" | "high";
  note: string;
}

export function parseShapeResponse(text: string): ParsedShapeNote[] {
  const cleaned = stripFences(text);
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const notes: ParsedShapeNote[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.op !== "string" || record.op === "") continue;
    notes.push({
      op: record.op,
      outputChanged: record.outputChanged === true,
      confidence: coerceConfidence(record.confidence),
      note: typeof record.note === "string" ? record.note : "",
    });
  }
  return notes;
}
