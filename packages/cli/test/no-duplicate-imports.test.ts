import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const srcDirs = [
  join(repoRoot, "packages", "cli", "src"),
  join(repoRoot, "packages", "core", "src"),
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".ts"));
}

// Local binding names introduced by import statements in one file.
// Supports: import { a, b as c } from "..."; import d from "...";
// import * as ns from "..."; import "..."; (side-effect only, no bindings)
function importedNames(text: string): string[] {
  const names: string[] = [];
  const flat = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
  const importRe = /import\s+(?:type\s+)?([^;]*?)\s+from\s+['"][^'"]+['"]/g;
  let match: RegExpExecArray | null;
  const pushNamed = (part: string): void => {
    const cleaned = part.trim().replace(/^type\s+/, "");
    const alias = /\bas\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(cleaned)?.[1];
    if (alias !== undefined) {
      names.push(alias);
    } else {
      const orig = cleaned.split(/\s+/)[0];
      if (orig !== undefined && orig.length > 0) names.push(orig);
    }
  };
  while ((match = importRe.exec(flat)) !== null) {
    const clause = (match[1] ?? "").trim();
    if (clause.length === 0 || clause === "type") continue;
    if (clause.startsWith("*")) {
      const alias = /as\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(clause)?.[1];
      if (alias !== undefined) names.push(alias);
      continue;
    }
    if (clause.startsWith("{")) {
      const inner = clause.slice(1, clause.lastIndexOf("}"));
      for (const part of inner.split(",")) pushNamed(part);
      continue;
    }
    const def = clause
      .split(",")[0]
      ?.trim()
      .replace(/^type\s+/, "");
    if (def !== undefined && def.length > 0 && !def.startsWith("{")) {
      names.push(def);
    }
    const named = /\{([^}]*)\}/.exec(clause)?.[1];
    if (named !== undefined) {
      for (const part of named.split(",")) pushNamed(part);
    }
  }
  return names;
}

describe("no duplicate import bindings (silent bundler shadowing)", () => {
  it("no file imports two different symbols under the same local name", () => {
    const offenders: string[] = [];
    for (const dir of srcDirs) {
      for (const f of tsFiles(dir)) {
        const text = readFileSync(join(dir, f), "utf8");
        const names = importedNames(text);
        const seen = new Set<string>();
        const dupes = new Set<string>();
        for (const name of names) {
          if (seen.has(name)) dupes.add(name);
          seen.add(name);
        }
        if (dupes.size > 0) {
          offenders.push(`${f}: ${[...dupes].sort().join(", ")}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("importedNames parses named, default, aliased and namespace imports", () => {
    expect(importedNames(`import { a, b as c } from "./x.js";\nimport d from "./y.js";`)).toEqual([
      "a",
      "c",
      "d",
    ]);
    expect(importedNames(`import * as ns from "./z.js";`)).toEqual(["ns"]);
    expect(importedNames(`import "./side.js";`)).toEqual([]);
    expect(importedNames(`import def, { e, f as g } from "./w.js";`)).toEqual(["def", "e", "g"]);
  });
});
