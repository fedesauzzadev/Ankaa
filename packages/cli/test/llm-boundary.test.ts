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
const graphqlSrc = join(repoRoot, "packages", "graphql", "src");

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

  it("drift and route-signatures never import the analyze use-case (AC-DR.9)", () => {
    for (const file of ["drift.ts", "route-signatures.ts"]) {
      const text = readFileSync(join(cliSrc, file), "utf8");
      expect(text).not.toMatch(/from\s+['"]\.\/analyze\.js['"]/);
    }
  });

  it("fetch is only used through the LLM adapter and the github fetcher in cli sources", () => {
    const withFetch = tsFiles(cliSrc).filter((f) => {
      if (f === "llm.ts" || f === "github.ts") {
        return false;
      }
      const text = readFileSync(join(cliSrc, f), "utf8");
      return /(^|[^A-Za-z_.])fetch\s*\(/.test(text);
    });
    expect(withFetch).toEqual([]);
  });

  it("scan aggregation never touches network or LLM clients (AC-SO.9)", () => {
    const text = readFileSync(join(cliSrc, "scan.ts"), "utf8");
    expect(text).not.toMatch(/from\s+['"][^'"]*llm(\.js)?['"]/);
    expect(text).not.toMatch(/(^|[^A-Za-z_.])fetch\s*\(/);
    expect(text).not.toMatch(/from\s+['"]\.\/github\.js['"]/);
    expect(text).not.toMatch(/from\s+['"]\.\/analyze\.js['"]/);
  });

  it("packages/graphql is pure: no fs, net, http or fetch (AC-GQL.7, INV-1)", () => {
    const offenders = tsFiles(graphqlSrc).filter((f) => {
      const text = readFileSync(join(graphqlSrc, f), "utf8");
      return (
        /from\s+['"]node:(fs|net|http)[^'"]*['"]/.test(text) ||
        /(^|[^A-Za-z_.])fetch\s*\(/.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });
});
