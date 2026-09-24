import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));
const source = join(repoRoot, "packs", "elite");
const target = join(packageRoot, "packs", "elite");

rmSync(join(packageRoot, "packs"), { recursive: true, force: true });
mkdirSync(packageRoot, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`copied packs/elite -> ${target}`);
