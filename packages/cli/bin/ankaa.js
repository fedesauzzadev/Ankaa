#!/usr/bin/env node
import { run } from "../dist/ankaa.mjs";

// AC-A.16: un throw fuera de los paths conocidos nunca escupe stack crudo.
try {
  process.exitCode = await run(process.argv);
} catch (err) {
  const detail =
    err instanceof Error && err.message
      ? err.message.replace(/\s+/g, " ").slice(0, 500)
      : "unknown error";
  console.error(`error: internal failure: ${detail}`);
  process.exitCode = 2;
}
