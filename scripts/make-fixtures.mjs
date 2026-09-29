import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(join(root, "packages", "openapi", "package.json"));
const { parse } = require("yaml");

const lines = [
  "openapi: 3.1.0",
  "info:",
  "  title: Deep Nesting",
  "  version: 1.0.0",
  "paths:",
  "  /deep:",
  "    get:",
  "      responses:",
  '        "200":',
  "          description: OK",
  "          content:",
  "            application/json:",
  "              schema:",
];
let indent = 16;
for (let i = 0; i < 200; i++) {
  lines.push(" ".repeat(indent) + "type: object");
  lines.push(" ".repeat(indent) + "properties:");
  indent += 2;
  lines.push(" ".repeat(indent) + "child:");
  indent += 2;
}
lines.push(" ".repeat(indent) + "type: string");
const deepPath = join(root, "fixtures", "attack", "deep-nesting.yaml");
writeFileSync(deepPath, lines.join("\n") + "\n");
console.log("deep-nesting lines", lines.length);

const doc = parse(readFileSync(join(root, "fixtures", "petstore-mini.yaml"), "utf8"));
writeFileSync(join(root, "fixtures", "petstore-mini.json"), JSON.stringify(doc, null, 2) + "\n");
console.log("petstore json ok", Object.keys(doc.paths));
