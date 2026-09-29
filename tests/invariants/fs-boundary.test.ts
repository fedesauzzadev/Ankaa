import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { run } from "../../packages/cli/src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-inv7-"));
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

async function runCapture(
  argv: string[],
  io: { cwd?: string; isTTY?: boolean } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
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
    ...io,
  });
  return { code, stdout, stderr };
}

describe("INV-7 analyze writes only to explicit --output", () => {
  it("does not write into the spec directory", async () => {
    const dir = tempDir();
    const specPath = join(dir, "openapi.yaml");
    writeFileSync(specPath, (await import("node:fs")).readFileSync(petstore, "utf8"), "utf8");
    const before = readdirSync(dir).sort();

    const outDir = tempDir();
    const outPath = join(outDir, "report.json");
    const { code } = await runCapture([
      "analyze",
      specPath,
      "--format",
      "json",
      "--output",
      outPath,
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);

    const after = readdirSync(dir).sort();
    expect(after).toEqual(before);
    // no unexpected sibling files next to the spec
    expect(after).toEqual(["openapi.yaml"]);
  });

  it("output file is created under the requested path only", async () => {
    const outDir = tempDir();
    const outPath = join(outDir, "report.json");
    const { code } = await runCapture([
      "analyze",
      petstore,
      "--format",
      "json",
      "--output",
      outPath,
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    const files = readdirSync(outDir);
    expect(files).toEqual(["report.json"]);
  });
});

describe("INV-1 CLI analyze path with network stub", () => {
  it("does not call fetch during analyze", async () => {
    const spy = vi.fn(() => {
      throw new Error("NETWORK_CALL_FORBIDDEN");
    });
    const original = globalThis.fetch;
    globalThis.fetch = spy as unknown as typeof fetch;
    try {
      const { code } = await runCapture(["analyze", petstore, "--no-color"]);
      expect([0, 1]).toContain(code);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});
