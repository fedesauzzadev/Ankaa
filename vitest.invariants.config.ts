import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@ankaa/core": join(root, "packages/core/src/index.ts"),
      "@ankaa/openapi": join(root, "packages/openapi/src/index.ts"),
      "@ankaa/reporters": join(root, "packages/reporters/src/index.ts"),
      "@ankaa/cli": join(root, "packages/cli/src/index.ts"),
    },
  },
  test: {
    include: ["tests/invariants/**/*.test.ts"],
    environment: "node",
    name: "invariants",
    setupFiles: ["./tests/invariants/setup-license.ts"],
  },
});
