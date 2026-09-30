import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { startLlmStub } from "./llm-stub.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtureDir = join(repoRoot, "fixtures");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-import-"));
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

type Env = Record<string, string | undefined>;

async function runCapture(
  argv: string[],
  io: { cwd?: string; env?: Env } = {},
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
    env: io.env ?? {},
    ...io,
  });
  return { code, stdout, stderr };
}

function licEnv(llmUrl?: string): Env {
  return {
    ANKAA_LICENSE_KEY: DEV_LICENSE_KEY,
    ...(llmUrl !== undefined
      ? { ANKAA_LLM_BASE_URL: llmUrl, ANKAA_LLM_MODEL: "stub" }
      : {}),
  };
}

const VALID_A = {
  id: "TEAM-101",
  category: "custom",
  severity: "error",
  message: "Every operation must accept x-request-id.",
  fix: "Add a required header parameter named x-request-id.",
  when: { not: { op: "headerRequired", name: "x-request-id" } },
};

const VALID_B = {
  id: "TEAM-102",
  category: "docs",
  severity: "warning",
  message: "Write operations must document a 400 response.",
  when: { op: "responseMissing", status: "400" },
};

const INVALID = {
  id: "bad id!!",
  category: "custom",
  severity: "error",
  message: "Broken on purpose.",
  when: { op: "securityMissing" },
};

const MIXED_RESPONSE = [VALID_A, INVALID, VALID_B, "just a string"];

function rulesResponse(entries: unknown[]): { response: unknown } {
  return {
    response: {
      choices: [{ message: { content: JSON.stringify(entries) } }],
    },
  };
}

function setupGuideline(ext: "md" | "pdf" | "docx" = "md"): string {
  const dir = tempDir();
  copyFileSync(join(fixtureDir, `guideline.${ext}`), join(dir, `guideline.${ext}`));
  return dir;
}

describe("rules import e2e (f8-rules-import)", () => {
  it("AC-RI.4/5/6 mixed drafts: valid written, invalid reported, summary exact", async () => {
    const dir = setupGuideline();
    const stub = await startLlmStub(rulesResponse(MIXED_RESPONSE));
    try {
      const out = await runCapture(["rules", "import", "--from", "guideline.md"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(out.stdout).toContain("2 imported, 2 rejected");
      expect(out.stdout).toContain("imported-rules.yaml");
      expect(out.stdout).toContain("customRules");
      const written = readFileSync(join(dir, "imported-rules.yaml"), "utf8");
      expect(written).toContain("TEAM-101");
      expect(written).toContain("TEAM-102");
      expect(written).not.toContain("bad id!!");
      expect(written).not.toContain("just a string");
      expect(out.stderr).toContain("rejected draft #2");
      expect(out.stderr).toContain("rejected draft #4");
    } finally {
      await stub.close();
    }
  });

  it("AC-RI.2 secrets in the guideline never reach the stub", async () => {
    const dir = setupGuideline();
    const stub = await startLlmStub(rulesResponse([VALID_A]));
    try {
      const out = await runCapture(["rules", "import", "--from", "guideline.md"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(stub.requests.length).toBeGreaterThan(0);
      for (const req of stub.requests) {
        expect(req.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
        expect(req.body).toContain("***REDACTED***");
      }
    } finally {
      await stub.close();
    }
  });

  it("AC-RI.3 long docs split into bounded chunks, duplicates collapse", async () => {
    const dir = tempDir();
    const big = `${readFileSync(join(fixtureDir, "guideline.md"), "utf8")}\n\n`.repeat(12);
    writeFileSync(join(dir, "big.md"), big, "utf8");
    const stub = await startLlmStub(rulesResponse([VALID_A, VALID_B]));
    try {
      const out = await runCapture(["rules", "import", "--from", "big.md"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(stub.requests.length).toBeGreaterThan(1);
      for (const req of stub.requests) {
        const body = JSON.parse(req.body) as {
          messages: Array<{ content: string }>;
        };
        const userContent = body.messages[1]!.content;
        const chunk = userContent.slice(userContent.indexOf("Guideline (redacted):\n") + 23);
        expect(chunk.length).toBeLessThanOrEqual(8000);
      }
      expect(out.stdout).toContain("2 imported,");
      expect(out.stderr).toContain("split into");
    } finally {
      await stub.close();
    }
  });

  it("AC-RI.7 re-run with the same stub is byte-identical", async () => {
    const dir = setupGuideline();
    const stub = await startLlmStub(rulesResponse(MIXED_RESPONSE));
    try {
      const env = licEnv(stub.url);
      const first = await runCapture(["rules", "import", "--from", "guideline.md"], {
        cwd: dir,
        env,
      });
      expect(first.code).toBe(0);
      const a = readFileSync(join(dir, "imported-rules.yaml"), "utf8");
      const second = await runCapture(["rules", "import", "--from", "guideline.md", "--force"], {
        cwd: dir,
        env,
      });
      expect(second.code).toBe(0);
      const b = readFileSync(join(dir, "imported-rules.yaml"), "utf8");
      expect(b).toBe(a);
    } finally {
      await stub.close();
    }
  });

  it("AC-RI.6 --out alternative and overwrite refusal", async () => {
    const dir = setupGuideline();
    const stub = await startLlmStub(rulesResponse([VALID_A]));
    try {
      const env = licEnv(stub.url);
      const out = await runCapture(
        ["rules", "import", "--from", "guideline.md", "--out", "team.yaml"],
        { cwd: dir, env },
      );
      expect(out.code).toBe(0);
      expect(out.stdout).toContain("review team.yaml");
      expect(readFileSync(join(dir, "team.yaml"), "utf8")).toContain("TEAM-101");

      const again = await runCapture(
        ["rules", "import", "--from", "guideline.md", "--out", "team.yaml"],
        { cwd: dir, env },
      );
      expect(again.code).toBe(2);
      expect(again.stderr).toContain("output exists");
      expect(again.stderr).toContain("--force");

      const forced = await runCapture(
        ["rules", "import", "--from", "guideline.md", "--out", "team.yaml", "--force"],
        { cwd: dir, env },
      );
      expect(forced.code).toBe(0);
    } finally {
      await stub.close();
    }
  });

  it("zero valid drafts exits 2 and writes nothing", async () => {
    const dir = setupGuideline();
    const stub = await startLlmStub(rulesResponse([INVALID, "nope"]));
    try {
      const out = await runCapture(["rules", "import", "--from", "guideline.md"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(2);
      expect(out.stderr).toContain("no valid rules produced");
      expect(() => readFileSync(join(dir, "imported-rules.yaml"), "utf8")).toThrow();
    } finally {
      await stub.close();
    }
  });

  it("AC-RI.10 gates: license and llm with fix-identical messages", async () => {
    const dir = setupGuideline();
    const noLicense = await runCapture(["rules", "import", "--from", "guideline.md"], {
      cwd: dir,
      env: {},
    });
    expect(noLicense.code).toBe(2);
    expect(noLicense.stderr).toContain("missing license");

    const noLlm = await runCapture(["rules", "import", "--from", "guideline.md"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(noLlm.code).toBe(2);
    expect(noLlm.stderr).toContain("llm not configured");
  });

  it("AC-RI.1 unsupported extension and missing file", async () => {
    const dir = setupGuideline();
    const llmOnly = {
      ...licEnv(),
      ANKAA_LLM_BASE_URL: "http://127.0.0.1:9",
      ANKAA_LLM_MODEL: "stub",
    };
    writeFileSync(join(dir, "notes.exe"), "MZ fake binary", "utf8");
    const bad = await runCapture(["rules", "import", "--from", "notes.exe"], {
      cwd: dir,
      env: llmOnly,
    });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("unsupported import extension");
    expect(bad.stderr).toContain(".pdf");

    const missing = await runCapture(["rules", "import", "--from", "nope.md"], {
      cwd: dir,
      env: llmOnly,
    });
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("import file not found");
  });

  it("AC-RI.8 pdf fixture flows end to end", async () => {
    const dir = setupGuideline("pdf");
    const stub = await startLlmStub(rulesResponse([VALID_A, VALID_B]));
    try {
      const out = await runCapture(["rules", "import", "--from", "guideline.pdf"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(out.stdout).toContain("2 imported, 0 rejected");
      expect(readFileSync(join(dir, "imported-rules.yaml"), "utf8")).toContain("TEAM-101");
    } finally {
      await stub.close();
    }
  });

  it("AC-RI.9 docx fixture flows end to end", async () => {
    const dir = setupGuideline("docx");
    const stub = await startLlmStub(rulesResponse([VALID_A]));
    try {
      const out = await runCapture(["rules", "import", "--from", "guideline.docx"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(out.stdout).toContain("1 imported, 0 rejected");
      expect(readFileSync(join(dir, "imported-rules.yaml"), "utf8")).toContain("TEAM-101");
    } finally {
      await stub.close();
    }
  });

  it("AC-RI.11 import writes only the explicit --out (INV-7)", async () => {
    const dir = setupGuideline();
    const before = new Set(readdirSync(dir));
    const stub = await startLlmStub(rulesResponse([VALID_A]));
    try {
      const out = await runCapture(["rules", "import", "--from", "guideline.md"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      const after = new Set(readdirSync(dir));
      expect([...after].filter((f) => !before.has(f))).toEqual(["imported-rules.yaml"]);
    } finally {
      await stub.close();
    }
  });
});
