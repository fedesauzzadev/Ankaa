import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluate, flattenRuleLists, loadPack, type RulePack } from "@ankaa/core";
import { parseSpec } from "@ankaa/openapi";
import { buildReport, formatJson } from "@ankaa/reporters";
import { parse as parseYaml } from "yaml";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packDir = join(repoRoot, "packs", "elite");
const fixturesDir = join(repoRoot, "fixtures");
const coreSrc = join(repoRoot, "packages", "core", "src");
const openapiSrc = join(repoRoot, "packages", "openapi", "src");

function loadElitePack(): RulePack {
  const meta = parseYaml(readFileSync(join(packDir, "pack.yaml"), "utf8")) as {
    id: string;
    version: string;
    strictSource?: boolean;
  };
  const rulesDir = join(packDir, "rules");
  const files = readdirSync(rulesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const lists = files.map((f) => {
    const parsed = parseYaml(readFileSync(join(rulesDir, f), "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`rules/${f} must be an array`);
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
    throw new Error(JSON.stringify(result.errors));
  }
  return result.pack;
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const pack = loadElitePack();

function analyzeFixture(rel: string) {
  const raw = readFileSync(join(fixturesDir, rel), "utf8");
  const parsed = parseSpec(raw, { sourceLabel: rel });
  if (!parsed.ok) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  return evaluate({ specs: [parsed.spec], packs: [pack] });
}

const originalFetch = globalThis.fetch;
const originalXhr = globalThis.XMLHttpRequest;
const originalWs = globalThis.WebSocket;
let fetchCalls = 0;

beforeAll(() => {
  globalThis.fetch = ((...args: unknown[]) => {
    fetchCalls += 1;
    throw new Error(`NETWORK_CALL_FORBIDDEN: ${String(args[0])}`);
  }) as typeof fetch;
  globalThis.XMLHttpRequest = class ForbiddenXHR {
    open(): void {
      throw new Error("NETWORK_CALL_FORBIDDEN: XMLHttpRequest");
    }
    send(): void {
      throw new Error("NETWORK_CALL_FORBIDDEN: XMLHttpRequest");
    }
  } as unknown as typeof XMLHttpRequest;
  globalThis.WebSocket = class ForbiddenWS {
    constructor() {
      throw new Error("NETWORK_CALL_FORBIDDEN: WebSocket");
    }
  } as unknown as typeof WebSocket;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  globalThis.XMLHttpRequest = originalXhr;
  globalThis.WebSocket = originalWs;
  fetchCalls = 0;
});

describe("INV-1 no network during analyze path", () => {
  it("parse + evaluate + report never call fetch", () => {
    const result = analyzeFixture("petstore-mini.yaml");
    const report = buildReport({
      results: [result],
      inputs: [{ path: "petstore-mini.yaml", sha256: `sha256:${"0".repeat(64)}` }],
      packs: [{ id: pack.id, version: pack.version }],
      toolVersion: "0.0.0-dev",
    });
    formatJson(report, { pretty: false });
    expect(fetchCalls).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe("INV-2 determinism", () => {
  it("same pack + same fixture yields deep-equal findings twice", () => {
    const a = analyzeFixture("petstore-mini.yaml");
    const b = analyzeFixture("petstore-mini.yaml");
    expect(a.findings).toEqual(b.findings);
    expect(a.errors).toEqual(b.errors);
  });

  it("reportHash is stable across double build", () => {
    const result = analyzeFixture("petstore-mini.yaml");
    const make = () =>
      buildReport({
        results: [result],
        inputs: [{ path: "petstore-mini.yaml", sha256: `sha256:${"0".repeat(64)}` }],
        packs: [{ id: pack.id, version: pack.version }],
        toolVersion: "0.0.0-dev",
      });
    expect(make().reportHash).toBe(make().reportHash);
  });

  it("meta does not affect reportHash", () => {
    const result = analyzeFixture("petstore-mini.yaml");
    const base = {
      results: [result],
      inputs: [{ path: "petstore-mini.yaml", sha256: `sha256:${"0".repeat(64)}` }],
      packs: [{ id: pack.id, version: pack.version }],
      toolVersion: "0.0.0-dev",
    };
    const withMeta = buildReport({ ...base, meta: { durationMs: 123 } });
    const withoutMeta = buildReport(base);
    expect(withMeta.reportHash).toBe(withoutMeta.reportHash);
  });
});

describe("INV-3 core purity (source scan)", () => {
  it("packages/core/src has no network/AI/process imports or fetch usage", () => {
    const forbidden = [
      /from\s+["']node:http["']/,
      /from\s+["']node:https["']/,
      /from\s+["']node:net["']/,
      /from\s+["']node:dgram["']/,
      /from\s+["']node:tls["']/,
      /from\s+["']node:child_process["']/,
      /from\s+["']undici["']/,
      /from\s+["']axios["']/,
      /from\s+["']openai["']/,
      /from\s+["']@anthropic-ai\//,
      /\bfetch\s*\(/,
    ];
    const files = walkTsFiles(coreSrc);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = stripComments(readFileSync(file, "utf8"));
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${file} matches forbidden pattern ${pattern}`).toBe(false);
      }
    }
  });

  it("core package.json has no HTTP/LLM runtime dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "packages", "core", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    const banned = [
      "axios",
      "node-fetch",
      "got",
      "undici",
      "openai",
      "@anthropic-ai/sdk",
      "@modelcontextprotocol/sdk",
    ];
    for (const b of banned) {
      expect(deps).not.toContain(b);
    }
  });
});

describe("INV-4 no eval / Function / vm", () => {
  it("core and openapi sources avoid eval-like constructs", () => {
    const patterns: Array<[RegExp, string]> = [
      [/\beval\s*\(/, "eval("],
      [/new\s+Function\s*\(/, "new Function("],
      [/\bvm\s*\.\s*runIn/, "vm.runIn"],
      [/\bchild_process\b/, "child_process"],
      [/\bnode:vm\b/, "node:vm"],
      [/\bnode:child_process\b/, "node:child_process"],
    ];
    for (const dir of [coreSrc, openapiSrc]) {
      for (const file of walkTsFiles(dir)) {
        const text = stripComments(readFileSync(file, "utf8"));
        for (const [pattern, label] of patterns) {
          expect(pattern.test(text), `${file} uses forbidden ${label}`).toBe(false);
        }
      }
    }
  });

  it("malformed YAML fixture produces controlled parse error", async () => {
    const { parseSpec: parse } = await import("@ankaa/openapi");
    const raw = readFileSync(join(fixturesDir, "malformed.yaml"), "utf8");
    const result = parse(raw, { sourceLabel: "malformed.yaml" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      for (const err of result.errors) {
        expect(typeof err.message).toBe("string");
      }
    }
  });
});

describe("INV-5 fingerprint stability and sort idempotence", () => {
  it("sortFindings is idempotent under shuffle", async () => {
    const { sortFindings, computeFingerprint } = await import("@ankaa/core");
    const result = analyzeFixture("petstore-mini.yaml");
    const findings = result.findings;
    expect(findings.length).toBeGreaterThan(0);

    const once = sortFindings([...findings]);
    const twice = sortFindings([...once]);
    expect(twice).toEqual(once);

    const shuffled = [...findings].reverse();
    const fromShuffle = sortFindings(shuffled);
    expect(fromShuffle.map((f) => f.fingerprint)).toEqual(once.map((f) => f.fingerprint));

    for (const f of once) {
      const { fingerprint, ...base } = f;
      expect(computeFingerprint(base)).toBe(fingerprint);
    }
  });
});

describe("INV-6 packs versioned in report", () => {
  it("report packs[] carry CalVer and findings carry packVersion", () => {
    const result = analyzeFixture("petstore-mini.yaml");
    const report = buildReport({
      results: [result],
      inputs: [{ path: "petstore-mini.yaml", sha256: `sha256:${"0".repeat(64)}` }],
      packs: [{ id: pack.id, version: pack.version }],
      toolVersion: "0.0.0-dev",
    });
    expect(report.packs.length).toBeGreaterThan(0);
    for (const p of report.packs) {
      expect(p.version).toMatch(/^\d{4}\.\d{2}(\.\d+)?$/);
    }
    for (const f of report.findings) {
      expect(f.packVersion).toMatch(/^\d{4}\.\d{2}(\.\d+)?$/);
    }
  });
});

describe("INV-7 fs boundary (pure path)", () => {
  it("evaluate path does not create files next to fixtures", () => {
    const dir = fixturesDir;
    const snapshot = () =>
      readdirSync(dir)
        .map((n) => `${n}:${statSync(join(dir, n)).mtimeMs}`)
        .sort();
    const before = snapshot();
    analyzeFixture("petstore-mini.yaml");
    const after = snapshot();
    expect(after).toEqual(before);
  });
});

describe("pack embed (AC-P.8 / INV-1)", () => {
  it("CLI package embeds a loadable elite pack under packages/cli/packs", () => {
    const embedded = join(repoRoot, "packages", "cli", "packs", "elite", "pack.yaml");
    expect(statSync(embedded).isFile()).toBe(true);
    const rulesDir = join(repoRoot, "packages", "cli", "packs", "elite", "rules");
    const files = readdirSync(rulesDir).filter((f) => f.endsWith(".yaml"));
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  it("embedded pack loads with ≥ 50 rules", () => {
    const embeddedDir = join(repoRoot, "packages", "cli", "packs", "elite");
    const meta = parseYaml(readFileSync(join(embeddedDir, "pack.yaml"), "utf8")) as {
      id: string;
      version: string;
      strictSource?: boolean;
    };
    const rulesDir = join(embeddedDir, "rules");
    const lists = readdirSync(rulesDir)
      .filter((f) => f.endsWith(".yaml"))
      .sort()
      .map((f) => {
        const parsed = parseYaml(readFileSync(join(rulesDir, f), "utf8")) as unknown[];
        expect(Array.isArray(parsed)).toBe(true);
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
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.rules.length).toBeGreaterThanOrEqual(50);
    }
  });
});
