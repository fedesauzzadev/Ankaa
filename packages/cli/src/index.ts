import { packageVersion } from "@apigovscan/core";

export function getVersion(): string {
  return packageVersion();
}

export function getHelp(): string {
  return [
    "apigovscan — local-first API governance analyzer",
    "",
    "Usage:",
    "  apigovscan --version",
    "  apigovscan --help",
    "",
    "Commands (coming soon, see specs/f1-analyze.md):",
    "  analyze <path>    Analyze an OpenAPI document",
    "  rules list        List available rules",
    "  rules explain     Explain a rule",
    "",
    "Docs: docs/SDD.md",
  ].join("\n");
}

export function run(argv: readonly string[]): number {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${getHelp()}\n`);
    return 0;
  }

  if (args.includes("--version") || args.includes("-V")) {
    process.stdout.write(`${getVersion()}\n`);
    return 0;
  }

  const command = args[0];
  if (command === "analyze") {
    process.stderr.write(
      "analyze is not implemented yet (milestone M1.4). See specs/f1-analyze.md\n",
    );
    return 2;
  }

  process.stderr.write(`Unknown command: ${command}\nRun apigovscan --help\n`);
  return 2;
}
