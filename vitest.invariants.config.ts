import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/invariants/**/*.test.ts"],
    environment: "node",
    name: "invariants",
  },
});
