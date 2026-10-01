import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createLspAnalyzeFn } from "../src/lsp.js";
import { prepareAnalysis } from "../src/analyze-setup.js";
import { loadConfig } from "../src/config.js";
import { createFsPackRepository } from "../src/loaders.js";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

async function lspAnalyze() {
  const config = loadConfig(repoRoot, undefined);
  if (!config.ok) throw new Error(config.error);
  const prepared = prepareAnalysis(repoRoot, config.config, {
    rulesFiles: [],
    baselineMode: "off",
  });
  if (!prepared.ok) throw new Error(prepared.error);
  return createLspAnalyzeFn(prepared.setup, createFsPackRepository(repoRoot));
}

async function cliFindings(): Promise<Array<{ ruleId: string; message: string }>> {
  let stdout = "";
  const code = await run(
    ["node", "cli", "analyze", petstore, "--format", "json", "--fail-on", "never", "--no-color"],
    {
      stdout: (t) => {
        stdout += t;
      },
      stderr: () => {},
      isTTY: false,
      cwd: repoRoot,
    },
  );
  expect(code).toBe(0);
  const report = JSON.parse(stdout) as {
    findings: Array<{ ruleId: string; message: string }>;
  };
  return report.findings.map((f) => ({ ruleId: f.ruleId, message: f.message }));
}

describe("ankaa lsp (f17-lsp, AC-LSP.1/3/4/5)", () => {
  it("AC-LSP.1 same findings as the CLI on the shared fixture", async () => {
    const analyze = await lspAnalyze();
    const content = readFileSync(petstore, "utf8");
    const result = await analyze(content, "yaml", `file://${petstore.replace(/\\/g, "/")}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lsp = result.diagnostics.map((d) => ({ ruleId: d.ruleId, message: d.message }));
    expect(lsp).toEqual(await cliFindings());
  }, 30000);

  it("AC-LSP.1 diagnostics carry source positions for YAML", async () => {
    const analyze = await lspAnalyze();
    const content = readFileSync(petstore, "utf8");
    const result = await analyze(content, "yaml", `file://${petstore.replace(/\\/g, "/")}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const withPosition = result.diagnostics.find((d) => d.position !== undefined);
    expect(withPosition).toBeDefined();
    expect(withPosition!.position!.line).toBeGreaterThan(1);
  });

  it("AC-LSP.3 invalid spec yields an honest parse error, no crash", async () => {
    const analyze = await lspAnalyze();
    const result = await analyze("::: [broken", "yaml", "file:///broken.yaml");
    expect(result.ok).toBe(false);
    expect(result.parseError).toMatch(/YAML_PARSE|JSON_PARSE|PARSE/);
    expect(result.diagnostics).toEqual([]);
  });

  it("AC-LSP.4 the analyzer never touches the network (INV-1)", async () => {
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = ((): Promise<never> => {
      called += 1;
      return Promise.reject(new Error("network is forbidden"));
    }) as typeof globalThis.fetch;
    try {
      const analyze = await lspAnalyze();
      const content = readFileSync(petstore, "utf8");
      const result = await analyze(content, "yaml", `file://${petstore.replace(/\\/g, "/")}`);
      expect(result.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(called).toBe(0);
  });

  it("AC-LSP.5 two analyses of the same buffer are identical", async () => {
    const analyze = await lspAnalyze();
    const content = readFileSync(petstore, "utf8");
    const uri = `file://${petstore.replace(/\\/g, "/")}`;
    const first = await analyze(content, "yaml", uri);
    const second = await analyze(content, "yaml", uri);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
