import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  flattenRuleLists,
  loadPack,
  type RulePack,
} from "@apigovscan/core";

export function loadPackFromDir(packDir: string): RulePack {
  const metaRaw = parseYaml(readFileSync(join(packDir, "pack.yaml"), "utf8"));
  if (metaRaw === null || typeof metaRaw !== "object" || Array.isArray(metaRaw)) {
    throw new Error(`pack.yaml in ${packDir} must be a mapping`);
  }
  const meta = metaRaw as { id?: unknown; version?: unknown; strictSource?: unknown };
  if (typeof meta.id !== "string" || typeof meta.version !== "string") {
    throw new Error(`pack.yaml in ${packDir} must declare string id and version`);
  }

  const rulesDir = join(packDir, "rules");
  const files = existsSync(rulesDir)
    ? readdirSync(rulesDir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .sort()
    : [];

  const lists = files.map((f) => {
    const parsed = parseYaml(readFileSync(join(rulesDir, f), "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`rules/${f} must be a YAML array of rules`);
    }
    return parsed;
  });

  const result = loadPack(
    {
      id: meta.id,
      version: meta.version,
      strictSource: meta.strictSource === true,
    },
    flattenRuleLists(lists),
  );

  if (!result.ok) {
    const detail = result.errors
      .map((e) => `${e.ruleId ?? "(unknown)"}: ${e.issues.join("; ")}`)
      .join("; ");
    throw new Error(`invalid pack in ${packDir}: ${detail}`);
  }

  return result.pack;
}

export function findElitePackDir(startDirs: readonly string[]): string | null {
  for (const start of startDirs) {
    let dir = resolve(start);
    for (;;) {
      const candidate = join(dir, "packs", "elite");
      if (existsSync(join(candidate, "pack.yaml"))) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

export function defaultPackSearchRoots(cwd: string): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [cwd, moduleDir];
}
