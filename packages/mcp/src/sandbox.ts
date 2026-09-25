import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export class SandboxError extends Error {
  constructor(input: string) {
    super(`path escapes cwd sandbox: ${input}`);
    this.name = "SandboxError";
  }
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveSandboxPath(cwd: string, input: string): string {
  if (input === "-") {
    throw new SandboxError(input);
  }
  const root = resolve(cwd);
  const abs = isAbsolute(input) ? resolve(input) : resolve(root, input);
  if (!isInside(root, abs)) {
    throw new SandboxError(input);
  }
  // realpath is a containment check only; return the lexical path so MCP
  // labels match the CLI (parity of report.input / reportHash). On macOS the
  // temp dir (/var/folders -> /private/var/folders) would otherwise diverge.
  try {
    const realRoot = realpathSync(root);
    const realAbs = realpathSync(abs);
    if (!isInside(realRoot, realAbs)) {
      throw new SandboxError(input);
    }
  } catch (err) {
    if (err instanceof SandboxError) throw err;
  }
  return abs;
}
