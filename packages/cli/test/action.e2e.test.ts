import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtures = join(repoRoot, "fixtures");
const actionFile = join(repoRoot, "action", "action.yml");
const actionReadme = join(repoRoot, "action", "README.md");
const dogfoodWorkflow = join(repoRoot, ".github", "workflows", "apigovscan.yml");

interface ActionDoc {
  name: string;
  description: string;
  branding?: { icon?: string; color?: string };
  inputs: Record<string, { description?: string; default?: string }>;
  outputs: Record<string, { description?: string; value?: string }>;
  runs: {
    using: string;
    steps: Array<{
      name?: string;
      id?: string;
      if?: string;
      shell?: string;
      env?: Record<string, string>;
      run?: string;
    }>;
  };
}

function loadAction(): ActionDoc {
  return parseYaml(readFileSync(actionFile, "utf8")) as ActionDoc;
}

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-action-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // temp cleanup is best-effort
    }
  }
});

async function runCapture(
  argv: string[],
  io: { cwd?: string } = {},
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

/** Mirror the action's step sequence in-process (no bash needed). */
async function simulateAction(
  cwd: string,
  specPath: string,
  failOn: string,
): Promise<{
  sarifPath: string;
  sarif: string;
  annotations: string;
  summary: string;
  outputs: string;
  gateCode: number;
}> {
  const sarifPath = join(cwd, "apigovscan.sarif");
  const artifact = await runCapture(
    ["analyze", specPath, "--fail-on", "never", "--format", "sarif", "--output", sarifPath],
    { cwd },
  );
  expect([0, 1]).toContain(artifact.code);

  const annotations = await runCapture(
    ["analyze", specPath, "--fail-on", "never", "--format", "annotations"],
    { cwd },
  );

  const gate = await runCapture(
    ["analyze", specPath, "--fail-on", failOn, "--format", "markdown"],
    { cwd },
  );

  const summaryPath = join(cwd, "step_summary.md");
  const outputsPath = join(cwd, "step_outputs.txt");
  writeFileSync(summaryPath, gate.stdout, "utf8");
  writeFileSync(outputsPath, `exit-code=${gate.code}\n`, "utf8");

  return {
    sarifPath,
    sarif: readFileSync(sarifPath, "utf8"),
    annotations: annotations.stdout,
    summary: readFileSync(summaryPath, "utf8"),
    outputs: readFileSync(outputsPath, "utf8"),
    gateCode: gate.code,
  };
}

describe("action/action.yml structure (f5-action)", () => {
  it("AC-ACT.1 declares inputs, outputs and composite steps", () => {
    const action = loadAction();
    expect(action.name).toBe("ApiGovScan");
    expect(Object.keys(action.inputs).sort()).toEqual([
      "baseline",
      "cli",
      "config",
      "fail-on",
      "format",
      "license-key",
      "path",
      "review-ref",
      "rules",
    ]);
    expect(action.inputs.path.default).toBe(".");
    expect(action.inputs["fail-on"].default).toBe("error");
    expect(action.inputs.format.default).toBe("sarif");
    expect(action.inputs.cli.default).toBe("npx -y @apigovscan/cli");
    expect(action.inputs.baseline.default).toBe("false");
    expect(action.inputs["review-ref"].default).toBe("");
    expect(Object.keys(action.outputs).sort()).toEqual(["exit-code", "sarif-path"]);
    expect(action.runs.using).toBe("composite");
    expect(action.runs.steps.length).toBeGreaterThanOrEqual(3);
    const ids = action.runs.steps.map((s) => s.id);
    expect(ids).toContain("artifact");
    expect(ids).toContain("annotations");
    expect(ids).toContain("gate");
    expect(ids).toContain("review-base");
    for (const step of action.runs.steps) {
      expect(step.shell).toBe("bash");
    }
  });

  it("AC-D.9 license-key input reaches every step as env", () => {
    const action = loadAction();
    expect(action.inputs["license-key"].default).toBe("");
    for (const step of action.runs.steps) {
      expect(step.env?.APIGOVSCAN_LICENSE_KEY).toContain("${{ inputs.license-key }}");
    }
  });

  it("AC-ACT.5 no ${{ }} interpolation inside run blocks", () => {
    const action = loadAction();
    for (const step of action.runs.steps) {
      expect(step.run).toBeDefined();
      expect(step.run!).not.toContain("${{");
      expect(step.run!).not.toContain("}}");
    }
    // interpolation lives in env/outputs only
    for (const step of action.runs.steps) {
      expect(step.env).toBeDefined();
    }
    expect(action.outputs["sarif-path"].value).toContain("${{ steps.artifact");
    expect(action.outputs["exit-code"].value).toContain("${{ steps.gate");
  });

  it("AC-ACT.6 run blocks only invoke the CLI plus shell builtins", () => {
    const action = loadAction();
    const cliSteps = action.runs.steps.filter((s) => s.id !== "review-base");
    for (const step of cliSteps) {
      expect(step.run).toContain("$AG_CLI");
      expect(step.run).toContain("analyze");
      expect(step.run).not.toContain("convertFrom-Yaml");
      expect(step.run).not.toContain("parse");
      expect(step.run).not.toContain("node -e");
    }
    const reviewBase = action.runs.steps.find((s) => s.id === "review-base")!;
    expect(reviewBase.run).toContain("git fetch");
    expect(reviewBase.run).toContain("git show");
    expect(reviewBase.run).not.toContain("$AG_CLI");
    expect(reviewBase.run).not.toContain("node -e");
    // gate is the only step allowed to fail the job
    const gate = action.runs.steps.find((s) => s.id === "gate")!;
    expect(gate.run).toContain('--fail-on "$AG_FAIL_ON"');
    expect(gate.run).toContain("$GITHUB_STEP_SUMMARY");
    const artifact = action.runs.steps.find((s) => s.id === "artifact")!;
    expect(artifact.run).toContain("--fail-on never");
    expect(artifact.run).toContain("$GITHUB_OUTPUT");
    const annotations = action.runs.steps.find((s) => s.id === "annotations")!;
    expect(annotations.run).toContain("--format annotations");
    expect(annotations.run).toContain("--fail-on never");
  });

  it("AC-ACT.8 action README documents inputs and optional sarif upload", () => {
    expect(existsSync(actionReadme)).toBe(true);
    const readme = readFileSync(actionReadme, "utf8");
    expect(readme).toContain("upload-sarif");
    expect(readme).toContain("if: always()");
    expect(readme).toContain("fail-on");
    expect(readme).toContain("sarif-path");
    expect(readme).toContain("exit-code");
  });

  it("AC-ACT.7 dogfood workflow uses the local action", () => {
    expect(existsSync(dogfoodWorkflow)).toBe(true);
    const workflow = readFileSync(dogfoodWorkflow, "utf8");
    expect(workflow).toContain("uses: ./action");
    expect(workflow).toContain("fixtures/petstore-mini.yaml");
    expect(workflow).toContain("node packages/cli/bin/apigovscan.js");
    expect(workflow).toContain("review-ref: main");
  });
});

describe("action e2e simulation (AC-ACT.2–4)", () => {
  it("AC-ACT.2 artifact + annotations + summary + outputs", async () => {
    const cwd = tempDir();
    copyFileSync(join(fixtures, "petstore-mini.yaml"), join(cwd, "openapi.yaml"));

    const sim = await simulateAction(cwd, "openapi.yaml", "error");

    expect(existsSync(sim.sarifPath)).toBe(true);
    const sarif = JSON.parse(sim.sarif) as {
      version: string;
      runs: Array<{
        results: Array<{ level: string; locations: unknown[] }>;
      }>;
    };
    expect(sarif.version).toBe("2.1.0");
    const results = sarif.runs[0].results;
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => ["error", "warning", "note"].includes(r.level))).toBe(true);
    expect(JSON.stringify(results)).toContain("openapi.yaml");

    expect(sim.annotations).toMatch(/^::(error|warning|notice) /m);
    expect(sim.annotations).toContain("file=openapi.yaml");

    expect(sim.summary.startsWith("# ApiGovScan report")).toBe(true);
    expect(sim.summary).toContain("reportHash");
    expect(sim.summary).toContain("| Score |");
    expect(sim.summary).toContain("## Findings");

    // petstore-mini has 0 error findings => fail-on error passes
    expect(sim.outputs.trim()).toBe("exit-code=0");
  });

  it("AC-ACT.3 format=none flow leaves no artifact requirement (gate only)", async () => {
    const cwd = tempDir();
    copyFileSync(join(fixtures, "petstore-mini.yaml"), join(cwd, "openapi.yaml"));
    const gate = await runCapture(
      ["analyze", "openapi.yaml", "--fail-on", "never", "--format", "markdown"],
      { cwd },
    );
    expect(gate.code).toBe(0);
    expect(gate.stdout).toContain("# ApiGovScan report");
    expect(existsSync(join(cwd, "apigovscan.sarif"))).toBe(false);
  });

  it("AC-ACT.4 gate fails (exit-code=1) on error findings with fail-on error", async () => {
    const cwd = tempDir();
    copyFileSync(join(fixtures, "unsorted-paths.yaml"), join(cwd, "broken.yaml"));

    const failing = await simulateAction(cwd, "broken.yaml", "error");
    expect(failing.gateCode).toBe(1);
    expect(failing.outputs.trim()).toBe("exit-code=1");
    const sarif = JSON.parse(failing.sarif) as {
      runs: Array<{ results: Array<{ level: string }> }>;
    };
    expect(sarif.runs[0].results.some((r) => r.level === "error")).toBe(true);

    const passing = await simulateAction(cwd, "broken.yaml", "never");
    expect(passing.gateCode).toBe(0);
    expect(passing.outputs.trim()).toBe("exit-code=0");
  });
});

function reviewFixture(path: string): string {
  return [
    "openapi: 3.1.0",
    "info:",
    "  title: Users",
    "  version: 1.0.0",
    "paths:",
    `  ${path}:`,
    "    get:",
    "      operationId: getUser",
    "      responses:",
    '        "200":',
    "          description: OK",
    "",
  ].join("\n");
}

/** Mirror the action's review-mode step sequence (review-base → artifact → gate). */
async function simulateReviewAction(
  cwd: string,
  baselineBytes: string | Buffer,
  specPath: string,
  failOn: string,
): Promise<{
  baselinePath: string;
  artifactPath: string;
  artifactJson: Record<string, unknown> | undefined;
  summary: string;
  outputs: string;
  gateCode: number;
}> {
  // review-base step equivalent: git show FETCH_HEAD:<path> > <tmp>/contract.<ext>
  const tmp = tempDir();
  const ext = specPath.includes(".") ? (specPath.split(".").pop() ?? "yaml") : "yaml";
  const base = join(tmp, `contract.${ext}`);
  writeFileSync(base, baselineBytes);
  const label = `main:${specPath}`;

  await runCapture(
    [
      "review",
      base,
      specPath,
      "--fail-on",
      "never",
      "--format",
      "json",
      "--output",
      "apigovscan-review.json",
      "--baseline-label",
      label,
    ],
    { cwd },
  );

  const gate = await runCapture(
    ["review", base, specPath, "--fail-on", failOn, "--format", "console", "--baseline-label", label],
    { cwd },
  );

  const artifactPath = join(cwd, "apigovscan-review.json");
  return {
    baselinePath: base,
    artifactPath,
    artifactJson: existsSync(artifactPath)
      ? (JSON.parse(readFileSync(artifactPath, "utf8")) as Record<string, unknown>)
      : undefined,
    summary: `## ApiGovScan API change review\n\n${gate.stdout}`,
    outputs: `exit-code=${gate.code}\n`,
    gateCode: gate.code,
  };
}

describe("action review mode (f14 M14.3, AC-14.9)", () => {
  it("runs the same evaluator as the CLI review: artifact, summary and gate", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "candidate.yaml"), reviewFixture("/user"), "utf8");

    const sim = await simulateReviewAction(cwd, reviewFixture("/users"), "candidate.yaml", "error");

    const direct = await runCapture(
      [
        "review",
        sim.baselinePath,
        "candidate.yaml",
        "--format",
        "json",
        "--baseline-label",
        "main:candidate.yaml",
      ],
      { cwd },
    );
    expect(direct.code, direct.stderr).toBe(1);

    expect(sim.artifactJson?.schemaVersion).toBe(1);
    expect(sim.artifactJson?.outcome).toBe("findings");
    expect(sim.artifactJson?.reportHash).toBe(
      (JSON.parse(direct.stdout) as { reportHash: string }).reportHash,
    );
    expect(JSON.stringify(sim.artifactJson)).toContain("BRK-001");

    expect(sim.summary).toContain("## ApiGovScan API change review");
    expect(sim.summary).toContain("review: findings");
    expect(sim.summary).toContain("baseline: main:candidate.yaml → candidate: candidate.yaml");
    expect(sim.outputs.trim()).toBe("exit-code=1");

    const passing = await simulateReviewAction(cwd, reviewFixture("/users"), "candidate.yaml", "never");
    expect(passing.outputs.trim()).toBe("exit-code=0");
  });

  it("re-runs produce a byte-identical summary (determinism, stateless re-runs)", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "candidate.yaml"), reviewFixture("/user"), "utf8");
    const first = await simulateReviewAction(cwd, reviewFixture("/users"), "candidate.yaml", "error");
    const second = await simulateReviewAction(cwd, reviewFixture("/users"), "candidate.yaml", "error");
    expect(second.summary).toBe(first.summary);
    expect(second.gateCode).toBe(first.gateCode);
  });

  it("unsupported comparison fails with exit 2 and never reports clean", async () => {
    const cwd = tempDir();
    const graphql = readFileSync(join(fixtures, "graphql", "schema.graphql"));
    writeFileSync(join(cwd, "candidate.graphql"), graphql);

    const sim = await simulateReviewAction(cwd, graphql, "candidate.graphql", "never");
    expect(sim.gateCode).toBe(2);
    expect(sim.artifactJson?.outcome).toBe("error");
    expect(sim.artifactJson?.comparison).toMatchObject({ supported: false });
    expect(sim.summary).toContain("review: error");
  });

  it("missing baseline and malformed candidate are operational errors (exit 2)", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "candidate.yaml"), reviewFixture("/user"), "utf8");

    const missing = await runCapture(
      ["review", join(cwd, "does-not-exist.yaml"), "candidate.yaml", "--format", "json"],
      { cwd },
    );
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("input not found");

    writeFileSync(join(cwd, "broken.yaml"), "openapi: [not: valid\n", "utf8");
    writeFileSync(join(cwd, "base.yaml"), reviewFixture("/users"), "utf8");
    const malformed = await runCapture(
      ["review", join(cwd, "base.yaml"), "broken.yaml", "--format", "json"],
      { cwd },
    );
    expect(malformed.code).toBe(2);
    expect(malformed.stderr).toContain("failed to parse");
  });

  it("review-base step extracts the baseline with git and guards unsupported inputs", () => {
    const action = loadAction();
    const reviewBase = action.runs.steps.find((s) => s.id === "review-base")!;
    expect(reviewBase.if).toBe("inputs.review-ref != ''");
    expect(reviewBase.run).toContain('git fetch --depth=1 origin "$AG_REVIEW_REF"');
    expect(reviewBase.run).toContain('git show "FETCH_HEAD:$AG_PATH"');
    expect(reviewBase.run).toContain("baseline-path=");
    expect(reviewBase.run).toContain("::error::baseline contract not found");
    expect(reviewBase.run).toContain("rules input is not supported in review mode");
    expect(reviewBase.env?.AG_REVIEW_BASE_PATH).toBeUndefined();

    const artifact = action.runs.steps.find((s) => s.id === "artifact")!;
    expect(artifact.env?.AG_REVIEW_BASE_PATH).toBe(
      "${{ steps.review-base.outputs.baseline-path }}",
    );
    expect(artifact.env?.AG_REVIEW_REF).toBe("${{ inputs.review-ref }}");
    expect(artifact.run).toContain('review "$AG_REVIEW_BASE_PATH" "$AG_PATH"');
    expect(artifact.run).toContain('--baseline-label "$AG_REVIEW_REF:$AG_PATH"');
    expect(artifact.run).toContain("--output apigovscan-review.json");

    const annotations = action.runs.steps.find((s) => s.id === "annotations")!;
    expect(annotations.if).toBe("inputs.review-ref == ''");

    const gate = action.runs.steps.find((s) => s.id === "gate")!;
    expect(gate.env?.AG_REVIEW_BASE_PATH).toBe(
      "${{ steps.review-base.outputs.baseline-path }}",
    );
    expect(gate.run).toContain('review "$AG_REVIEW_BASE_PATH" "$AG_PATH"');
  });
});
