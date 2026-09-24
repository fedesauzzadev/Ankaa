import js from "@eslint/js";
import tseslint from "typescript-eslint";

const CORE_FORBIDDEN = [
  "node:http",
  "node:http/*",
  "node:https",
  "node:net",
  "node:dgram",
  "node:tls",
  "node:child_process",
  "node:worker_threads",
  "undici",
  "axios",
  "node-fetch",
  "got",
  "openai",
  "@anthropic-ai/*",
  "@modelcontextprotocol/*",
];

const OPENAPI_FORBIDDEN = ["node:http", "node:http/*", "node:https", "node:net", "undici", "axios", "node-fetch"];

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.tsbuildinfo"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["packages/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: CORE_FORBIDDEN,
              message:
                "@apigovscan/core must stay pure (INV-1/INV-3): no network, no AI clients, no process spawning.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "fetch is forbidden in core (INV-1)." },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["packages/openapi/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: OPENAPI_FORBIDDEN,
              message: "openapi parser must not use network (INV-1): remote $ref is forbidden.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "fetch is forbidden in openapi parser (INV-1)." },
      ],
      "no-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-globals": "off",
    },
  },
);
