import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const binPath = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "apigovscan.js");

describe("bin global guard (AC-A.16)", () => {
  it("wraps run in try/catch with internal failure exit 2 and no raw stack", () => {
    const text = readFileSync(binPath, "utf8");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("try {");
    expect(flat).toContain("catch");
    expect(flat).toContain("internal failure");
    expect(flat).toMatch(/process\.exitCode\s*=\s*2/);
    expect(flat).not.toContain("err.stack");
  });
});
