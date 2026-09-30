#!/usr/bin/env node
// Rebrand gate (f16 AC-16.9): zero occurrences of the legacy brand outside
// the versioned allowlist. Fails with a report of offending files/lines.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = join(import.meta.dirname, "..");
const PATTERN = /apigovscan|ApiGovScan|APIGOVSCAN/;

const SCAN_ROOTS = [
  "packages",
  "action",
  "scripts",
  "docker",
  "examples",
  ".github",
  "tests",
  "docs",
  "packs",
];

const SCAN_FILES = [
  "README.md",
  "AGENTS.md",
  "package.json",
  "vitest.invariants.config.ts",
  "pnpm-lock.yaml",
];

// Historical/frozen artifacts: dated records, spec & task changelogs, the
// fixture corpus (byte-stable; edits would invalidate the rebrand golden
// fingerprints of fixtures/rebrand/golden-fingerprints.json), the negative
// legacy tests and this gate's own pattern.
const ALLOWLIST_PREFIXES = [
  "specs/",
  "tasks/",
  "plans/",
  "fixtures/",
  "packages/cli/packs/",
  "docs/product-discovery-backlog-2026-09.md",
  "packs/elite/CHANGELOG.md",
  "packages/cli/test/rebrand-legacy.test.ts",
  "scripts/rebrand-gate.mjs",
];

// The README migration note intentionally names the legacy brand so users
// coming from the previous name can migrate; wording is frozen (M16.6).
const ALLOWED_LINE_PATTERNS = [
  {
    file: "README.md",
    pattern:
      /^> (Si venías usando `apigovscan`|\(en Windows case-insensitive, con git: `git mv \.apigovscan \.ankaa`|`apigovscan\.yaml` → `ankaa\.yaml`)/,
  },
];

function allowed(relPath) {
  return ALLOWLIST_PREFIXES.some((prefix) => relPath === prefix || relPath.startsWith(prefix));
}

function lineAllowed(relPath, line) {
  return ALLOWED_LINE_PATTERNS.some(
    (entry) => relPath === entry.file && entry.pattern.test(line.trim()),
  );
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    const relPath = relative(repoRoot, full).split("\\").join("/");
    if (relPath === "packages/cli/packs") {
      continue;
    }
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const candidates = [];
for (const root of SCAN_ROOTS) {
  const abs = join(repoRoot, root);
  candidates.push(...listFiles(abs));
}
for (const file of SCAN_FILES) {
  candidates.push(join(repoRoot, file));
}

const violations = [];
for (const file of candidates) {
  const relPath = relative(repoRoot, file).split("\\").join("/");
  if (allowed(relPath)) continue;
  const text = readFileSync(file, "utf8");
  if (!PATTERN.test(text)) continue;
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (PATTERN.test(line) && !lineAllowed(relPath, line)) {
      violations.push(`${relPath}:${index + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (violations.length > 0) {
  console.error(`rebrand gate: ${violations.length} legacy-brand occurrence(s) outside the allowlist:`);
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  process.exit(1);
}
console.log("rebrand gate: clean (0 occurrences outside the allowlist)");
