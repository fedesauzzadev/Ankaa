import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const cliSrc = join(repoRoot, "packages", "cli", "src");
const coreSrc = join(repoRoot, "packages", "core", "src");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".ts"));
}

function hasLlmImport(file: string): boolean {
  const text = readFileSync(file, "utf8");
  return text
    .split("\n")
    .some((line) => /from\s+['"][^'"]*llm(\.js)?['"]/.test(line));
}

describe("LLM boundary (AC-SF.9)", () => {
  it("packages/core never imports the LLM adapter (INV-3)", () => {
    const offenders = tsFiles(coreSrc).filter((f) =>
      hasLlmImport(join(coreSrc, f)),
    );
    expect(offenders).toEqual([]);
  });

  it("the analyze use-case never imports the LLM adapter (INV-1)", () => {
    expect(hasLlmImport(join(cliSrc, "analyze.ts"))).toBe(false);
  });

  it("rules import never touches the analyze use-case (AC-RI.11)", () => {
    const text = readFileSync(join(cliSrc, "rules-import.ts"), "utf8");
    expect(text).not.toMatch(/from\s+['"]\.\/analyze\.js['"]/);
    expect(text).not.toMatch(/from\s+['"]@apigovscan\/openapi['"]/);
  });

  it("fetch is only used through the LLM adapter in cli sources", () => {
    const withFetch = tsFiles(cliSrc).filter((f) => {
      if (f === "llm.ts") {
        return false;
      }
      const text = readFileSync(join(cliSrc, f), "utf8");
      return /(^|[^A-Za-z_.])fetch\s*\(/.test(text);
    });
    expect(withFetch).toEqual([]);
  });
});
