/**
 * Offline install verification: npm install of the packed tarball into a
 * temp prefix (air-gap semantics: --offline, no audit/fund) and an analyze
 * run using the embedded dev license.
 *
 * Usage: node scripts/verify-pack.mjs [path-to-tgz]
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tgz =
  process.argv[2] ?? readdirSync(join(repoRoot, "dist-release")).find((f) => f.endsWith(".tgz"));
if (tgz === undefined) {
  console.error("no tarball found (run scripts/pack-cli.mjs first)");
  process.exit(2);
}
const tgzPath = join(repoRoot, "dist-release", tgz);

const work = mkdtempSync(join(tmpdir(), "apigovscan-verify-"));
try {
  const prefix = join(work, "prefix");
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "install",
      "--offline",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      "--prefix",
      prefix,
      tgzPath,
    ],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, npm_config_update_notifier: "false" },
    },
  );

  const fixtureDir = join(work, "spec");
  mkdirSync(fixtureDir, { recursive: true });
  cpSync(join(repoRoot, "fixtures", "petstore-mini.yaml"), join(fixtureDir, "openapi.yaml"));

  const bin = join(prefix, "node_modules", "@apigovscan", "cli", "bin", "apigovscan.js");
  const out = execFileSync(
    process.execPath,
    [
      bin,
      "analyze",
      join(fixtureDir, "openapi.yaml"),
      "--format",
      "json",
      "--license-key",
      process.env.APIGOVSCAN_DEV_LICENSE ?? "AGS-dev-20991231-2f6798197bf5",
    ],
    { encoding: "utf8", cwd: fixtureDir },
  );
  if (!out.includes("reportHash") || !out.includes("score")) {
    throw new Error("packed CLI output missing reportHash/score");
  }
  console.log("verify-pack OK: tarball installs offline and analyzes (score present)");
} finally {
  rmSync(work, { recursive: true, force: true });
}
