import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));

rmSync(join(packageRoot, "packs"), { recursive: true, force: true });
mkdirSync(packageRoot, { recursive: true });
for (const pack of ["elite", "graphql", "grpc", "asyncapi"]) {
  const source = join(repoRoot, "packs", pack);
  const target = join(packageRoot, "packs", pack);
  cpSync(source, target, { recursive: true });
  console.log(`copied packs/${pack} -> ${target}`);
}
