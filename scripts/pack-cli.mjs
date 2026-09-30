/**
 * Vendor packaging: stage packages/cli without workspace dependencies
 * (the CLI ships as a self-contained esbuild bundle) and npm pack it.
 *
 * Usage: node scripts/pack-cli.mjs [--out <dir>] [--version <semver>]
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliDir = join(repoRoot, "packages", "cli");

const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const outDir = arg("out") ?? join(repoRoot, "dist-release");
const version = arg("version");

const stage = mkdtempSync(join(tmpdir(), "ankaa-pack-"));
try {
  const pkg = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8"));
  // Bundled runtime: no dependencies in the shipped manifest.
  delete pkg.dependencies;
  delete pkg.devDependencies;
  delete pkg.scripts;
  if (version !== undefined) {
    pkg.version = version;
  }
  writeFileSync(join(stage, "package.json"), JSON.stringify(pkg, null, 2));

  cpSync(join(cliDir, "bin"), join(stage, "bin"), { recursive: true });
  cpSync(join(cliDir, "dist"), join(stage, "dist"), { recursive: true });
  cpSync(join(cliDir, "packs"), join(stage, "packs"), { recursive: true });
  cpSync(join(cliDir, "LICENSE.md"), join(stage, "LICENSE.md"));

  mkdirSync(outDir, { recursive: true });
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["pack", "--ignore-scripts", "--pack-destination", outDir], {
    cwd: stage,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} finally {
  rmSync(stage, { recursive: true, force: true });
}

const tgz = readdirSync(outDir)
  .filter((f) => f.endsWith(".tgz"))
  .at(-1);
console.log(`packed -> ${join(outDir, tgz)}`);
