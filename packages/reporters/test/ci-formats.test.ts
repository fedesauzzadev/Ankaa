import { describe, expect, it } from "vitest";
import type { Finding } from "@ankaa/core";
import {
  buildReport,
  formatCheckstyle,
  formatCodequality,
  formatJunit,
} from "../src/index.js";

function finding(partial: Partial<Finding> = {}): Finding {
  return {
    fingerprint: "a".repeat(64),
    ruleId: "NAMING-001",
    severity: "error",
    category: "naming",
    message: "Resource path segments should be plural nouns.",
    location: "/paths/~1user/get",
    apiLocation: "GET /user",
    fix: "Rename user to users.",
    source: {
      title: "Microsoft REST API Guidelines",
      url: "https://github.com/microsoft/api-guidelines",
    },
    packId: "elite",
    packVersion: "2026.09.1",
    ...partial,
  };
}

function makeReport(overrides: Partial<Parameters<typeof buildReport>[0]> = {}) {
  return buildReport({
    results: [{ findings: [finding()], errors: [] }],
    inputs: [{ path: "openapi.yaml", sha256: "sha256:9f3a" }],
    packs: [{ id: "elite", version: "2026.09.1" }],
    toolVersion: "0.0.0-dev",
    ...overrides,
  });
}

function assertWellFormedXml(xml: string): void {
  expect(xml.endsWith("\n")).toBe(true);
  const stack: string[] = [];
  const tag = /<\/?([A-Za-z][\w.-]*)(?:\s[^<>]*?)?\/?>/g;
  const declaration = /^<\?xml [^?]*\?>\n/;
  expect(xml).toMatch(declaration);
  const body = xml.replace(declaration, "");
  let match: RegExpExecArray | null;
  while ((match = tag.exec(body)) !== null) {
    const raw = match[0];
    const name = match[1]!;
    if (raw.startsWith("<?")) continue;
    if (raw.startsWith("</")) {
      expect(stack.pop()).toBe(name);
    } else if (!raw.endsWith("/>")) {
      stack.push(name);
    }
  }
  expect(stack).toEqual([]);
}

describe("formatJunit (AC-CI.1/3)", () => {
  it("groups one testsuite per input with error/failure/skipped per severity", () => {
    const report = makeReport({
      results: [
        {
          findings: [
            finding(),
            finding({
              fingerprint: "b".repeat(64),
              ruleId: "SEC-002",
              severity: "warning",
              message: "Security scheme missing.",
              location: "/components",
            }),
            finding({
              fingerprint: "c".repeat(64),
              ruleId: "DOC-003",
              severity: "info",
              message: "Consider adding examples.",
              location: "/info",
            }),
          ],
          errors: [],
        },
      ],
    });
    const xml = formatJunit(report);
    assertWellFormedXml(xml);
    expect(xml).toContain('<testsuites name="ankaa" tests="3" failures="1" errors="1" skipped="1">');
    expect(xml).toContain('<testsuite name="openapi.yaml" tests="3"');
    expect(xml).toContain('<error message="Resource path segments should be plural nouns." type="NAMING-001">Rename user to users.</error>');
    expect(xml).toContain('<failure message="Security scheme missing." type="SEC-002">');
    expect(xml).toContain('<skipped message="Consider adding examples." type="DOC-003"/>');
    expect(xml).not.toContain("timestamp");
    expect(xml).not.toContain("<time");
  });

  it("multi-input locations map to suites by label; empty inputs still listed", () => {
    const report = makeReport({
      results: [
        {
          findings: [
            finding({ location: "specs/a.yaml#/paths/~1user" }),
            finding({
              fingerprint: "b".repeat(64),
              location: "specs/b.yaml#/info",
            }),
          ],
          errors: [],
        },
      ],
      inputs: [
        { path: "specs/a.yaml", sha256: "sha256:1" },
        { path: "specs/b.yaml", sha256: "sha256:2" },
        { path: "specs/clean.yaml", sha256: "sha256:3" },
      ],
    });
    const xml = formatJunit(report);
    assertWellFormedXml(xml);
    expect(xml).toContain('<testsuite name="specs/a.yaml" tests="1"');
    expect(xml).toContain('<testsuite name="specs/b.yaml" tests="1"');
    expect(xml).toContain('<testsuite name="specs/clean.yaml" tests="0" failures="0" errors="0" skipped="0">');
    expect(xml).toContain('name="NAMING-001 · /paths/~1user"');
  });

  it("escapes XML-special characters in messages", () => {
    const report = makeReport({
      results: [
        {
          findings: [
            finding({ message: `a < b & "c" > 'd'`, fix: "fix <it>" }),
          ],
          errors: [],
        },
      ],
    });
    const xml = formatJunit(report);
    assertWellFormedXml(xml);
    expect(xml).not.toContain("a < b");
    expect(xml).toContain("a &lt; b &amp; &quot;c&quot; &gt; &apos;d&apos;");
  });

  it("is byte-stable across runs", () => {
    const report = makeReport();
    expect(formatJunit(report)).toBe(formatJunit(makeReport()));
  });
});

describe("formatCheckstyle (AC-CI.1/3)", () => {
  it("emits file/error with fallback line 1 and pointer in message", () => {
    const xml = formatCheckstyle(makeReport());
    assertWellFormedXml(xml);
    expect(xml).toContain('<checkstyle version="ankaa/0.0.0-dev">');
    expect(xml).toContain('<file name="openapi.yaml">');
    expect(xml).toContain(
      'line="1" column="1" severity="error" message="Resource path segments should be plural nouns. [at /paths/~1user/get]" source="NAMING-001"',
    );
  });

  it("groups multi-input findings by label and keeps severity mapping", () => {
    const report = makeReport({
      results: [
        {
          findings: [
            finding({ location: "b.yaml#/info" }),
            finding({
              fingerprint: "b".repeat(64),
              severity: "warning",
              ruleId: "SEC-002",
              location: "a.yaml#/components",
            }),
            finding({
              fingerprint: "c".repeat(64),
              severity: "info",
              ruleId: "DOC-003",
              location: "a.yaml#/info",
            }),
          ],
          errors: [],
        },
      ],
      inputs: [
        { path: "a.yaml", sha256: "sha256:1" },
        { path: "b.yaml", sha256: "sha256:2" },
      ],
    });
    const xml = formatCheckstyle(report);
    assertWellFormedXml(xml);
    const aIndex = xml.indexOf('<file name="a.yaml">');
    const bIndex = xml.indexOf('<file name="b.yaml">');
    expect(aIndex).toBeGreaterThan(-1);
    expect(bIndex).toBeGreaterThan(aIndex);
    expect(xml).toContain('severity="warning"');
    expect(xml).toContain('severity="info"');
  });

  it("redacts secrets in messages", () => {
    const report = makeReport({
      results: [
        {
          findings: [finding({ message: "token: supersecretvalue123" })],
          errors: [],
        },
      ],
    });
    expect(formatCheckstyle(report)).toContain("token: ***REDACTED***");
  });

  it("is byte-stable across runs", () => {
    expect(formatCheckstyle(makeReport())).toBe(formatCheckstyle(makeReport()));
  });

  it("uses real line/column when findings carry a position (M17.8a)", () => {
    const report = makeReport({
      results: [
        {
          findings: [
            finding({ location: "/paths/~1users/get", position: { line: 12, column: 5 } }),
          ],
          errors: [],
        },
      ],
    });
    const xml = formatCheckstyle(report);
    assertWellFormedXml(xml);
    expect(xml).toContain('line="12" column="5"');
    expect(xml).not.toContain("[at /paths/~1users/get]");
  });
});

interface CodeQualityIssue {
  description: string;
  check_name: string;
  fingerprint: string;
  severity: string;
  location: { path: string; lines: { begin: number } };
}

describe("formatCodequality (AC-CI.1/3)", () => {
  it("maps severities and reuses the finding fingerprint", () => {
    const report = makeReport({
      results: [
        {
          findings: [
            finding(),
            finding({
              fingerprint: "b".repeat(64),
              ruleId: "SEC-002",
              severity: "warning",
              location: "/components",
            }),
            finding({
              fingerprint: "c".repeat(64),
              ruleId: "DOC-003",
              severity: "info",
              location: "/info",
            }),
          ],
          errors: [],
        },
      ],
    });
    const issues = JSON.parse(formatCodequality(report)) as CodeQualityIssue[];
    expect(issues.map((i) => i.severity)).toEqual(["critical", "major", "minor"]);
    expect(issues[0]!.fingerprint).toBe("a".repeat(64));
    expect(issues[0]!.location).toEqual({ path: "openapi.yaml", lines: { begin: 1 } });
    expect(issues[0]!.check_name).toBe("NAMING-001");
  });

  it("multi-input paths resolve per label; empty findings emit []", () => {
    const multi = makeReport({
      results: [{ findings: [finding({ location: "b.yaml#/info" })], errors: [] }],
      inputs: [
        { path: "a.yaml", sha256: "sha256:1" },
        { path: "b.yaml", sha256: "sha256:2" },
      ],
    });
    const issues = JSON.parse(formatCodequality(multi)) as CodeQualityIssue[];
    expect(issues[0]!.location.path).toBe("b.yaml");

    const empty = makeReport({ results: [{ findings: [], errors: [] }] });
    expect(formatCodequality(empty)).toBe("[]\n");
  });

  it("is byte-stable across runs", () => {
    expect(formatCodequality(makeReport())).toBe(formatCodequality(makeReport()));
  });

  it("lines.begin follows the finding position when present (M17.8a)", () => {
    const report = makeReport({
      results: [
        {
          findings: [finding({ position: { line: 12, column: 5 } })],
          errors: [],
        },
      ],
    });
    const issues = JSON.parse(formatCodequality(report)) as CodeQualityIssue[];
    expect(issues[0]!.location.lines.begin).toBe(12);
  });
});
