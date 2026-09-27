import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".pnpm-store"]);
const OPENAPI_NAMES = new Set(["openapi.yaml", "openapi.yml", "openapi.json"]);
const SWAGGER_NAMES = new Set(["swagger.yaml", "swagger.yml", "swagger.json"]);
const GRAPHQL_NAMES = new Set(["schema.graphql", "schema.gql"]);

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizePath(p: string): string {
  return sep === "\\" ? p.split(sep).join("/") : p;
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function collect(
  dir: string,
  root: string,
  pred: (name: string) => boolean,
  out: string[],
  recurse: boolean,
): void {
  for (const name of listDir(dir)) {
    const full = join(dir, name);
    if (isDir(full)) {
      if (recurse && !SKIP_DIRS.has(name)) {
        collect(full, root, pred, out, true);
      }
      continue;
    }
    if (pred(name)) {
      out.push(normalizePath(relative(root, full)));
    }
  }
}

export type DiscoverResult =
  | { ok: true; paths: string[] }
  | { ok: false; error: string };

export const DISCOVERY_PATTERNS = [
  "openapi.{yaml,yml,json}",
  "openapi/**/openapi.{yaml,yml,json}",
  "**/swagger.{yaml,yml,json}",
  "schema.{graphql,gql}",
  "**/schema.{graphql,gql}",
  "**/*.proto",
];

export function discoverSpecs(dir: string): DiscoverResult {
  const found: string[] = [];

  for (const name of OPENAPI_NAMES) {
    const full = join(dir, name);
    if (!isDir(full) && listDir(dir).includes(name)) {
      found.push(normalizePath(name));
    }
  }

  const openapiDir = join(dir, "openapi");
  if (isDir(openapiDir)) {
    collect(openapiDir, dir, (name) => OPENAPI_NAMES.has(name), found, true);
  }

  collect(dir, dir, (name) => SWAGGER_NAMES.has(name), found, true);

  collect(dir, dir, (name) => GRAPHQL_NAMES.has(name), found, true);

  collect(
    dir,
    dir,
    (name) => name.endsWith(".proto"),
    found,
    true,
  );

  const unique = [...new Set(found)].sort(cmp);

  if (unique.length === 0) {
    return {
      ok: false,
      error: [
        `no API specs found in ${normalizePath(dir)}`,
        "searched patterns:",
        ...DISCOVERY_PATTERNS.map((p) => `  ${p}`),
      ].join("\n"),
    };
  }

  return { ok: true, paths: unique };
}
