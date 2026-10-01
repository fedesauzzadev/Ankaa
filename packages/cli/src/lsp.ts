import { fileURLToPath } from "node:url";
import {
  attachPositions,
  evaluate,
  type Finding,
  type RulePack,
} from "@ankaa/core";
import { createLspServer, type LspAnalyzeResult, type LspServer } from "@ankaa/lsp";
import { parseSpecInput } from "./analyze.js";
import { prepareAnalysis, type AnalysisSetup } from "./analyze-setup.js";
import { loadConfig } from "./config.js";
import { checkLicense, licenseErrorMessage } from "./license.js";
import { createFsPackRepository } from "./loaders.js";
import { applySkillSuppressions } from "./skills.js";

const USAGE = [
  "usage: ankaa lsp [--debounce <ms>] [--skills-dir <dir>] [--config <file>] [--license-key <key>]",
  "",
  "LSP 3.17 server over stdio (editor-agnostic; see docs/editors.md).",
  "Diagnostics carry source 'ankaa', code = ruleId, same findings as analyze.",
  "",
].join("\n");

interface LspIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Record<string, string | undefined>;
  cwd: string;
}

function toDiagnostic(findings: Finding[]): LspAnalyzeResult["diagnostics"] {
  return findings.map((finding) => ({
    ruleId: finding.ruleId,
    severity: finding.severity,
    message: finding.message,
    location: finding.location,
    ...(finding.position !== undefined ? { position: finding.position } : {}),
  }));
}

export function createLspAnalyzeFn(
  setup: AnalysisSetup,
  packs: { loadActive: () => Promise<RulePack[]>; loadProtocol: (id: string) => Promise<RulePack> },
): (content: string, languageId: string, uri: string) => Promise<LspAnalyzeResult> {
  const packCache = new Map<string, RulePack[]>();
  const loadPacksFor = async (protocol: string | undefined): Promise<RulePack[]> => {
    const key = protocol ?? "openapi";
    const cached = packCache.get(key);
    if (cached !== undefined) return cached;
    const list =
      protocol === undefined || protocol === "openapi"
        ? await packs.loadActive()
        : [await packs.loadProtocol(protocol)];
    packCache.set(key, list);
    return list;
  };

  return async (content: string, _languageId: string, uri: string): Promise<LspAnalyzeResult> => {
    let path = uri;
    try {
      path = uri.startsWith("file:") ? fileURLToPath(uri) : uri;
    } catch {
      // keep the raw uri as label for non-file schemes
    }
    const bytes = new TextEncoder().encode(content);
    const parsed = parseSpecInput(path, bytes, path);
    if (!parsed.ok) {
      return { ok: false, parseError: parsed.error, diagnostics: [] };
    }
    const packList = await loadPacksFor(parsed.protocol === "openapi" ? undefined : parsed.protocol);
    const result = evaluate({
      specs: [parsed.spec],
      packs: packList,
      disabledRuleIds: setup.disabledRuleIds,
      severityOverrides: setup.severityOverrides,
    });
    let findings = attachPositions(result.findings, parsed.spec);
    if (setup.skillsSuppressions !== undefined && setup.skillsSuppressions.suppressions.length > 0) {
      findings = applySkillSuppressions(
        findings,
        setup.skillsSuppressions.suppressions,
        setup.skillsSuppressions.matchRegexes,
      ).visible;
    }
    return { ok: true, diagnostics: toDiagnostic(findings) };
  };
}

export async function runLspCommand(argv: readonly string[], io: LspIo): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }

  let debounceMs = 300;
  let skillsDir: string | undefined;
  let configPath: string | undefined;
  let licenseKey: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (
      token === "--debounce" ||
      token === "--skills-dir" ||
      token === "--config" ||
      token === "--license-key"
    ) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("-")) {
        io.stderr(`error: ${token} requires a value\n`);
        return 2;
      }
      if (token === "--debounce") {
        const ms = Number(value);
        if (!Number.isInteger(ms) || ms < 0 || ms > 60_000) {
          io.stderr("error: --debounce must be an integer 0..60000 (ms)\n");
          return 2;
        }
        debounceMs = ms;
      } else if (token === "--skills-dir") skillsDir = value;
      else if (token === "--config") configPath = value;
      else licenseKey = value;
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    io.stderr(`error: unexpected argument: ${token}\n`);
    return 2;
  }

  const configResult = loadConfig(io.cwd, configPath);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const license = checkLicense({
    flag: licenseKey,
    env: io.env.ANKAA_LICENSE_KEY,
    config: configResult.config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const prepared = prepareAnalysis(io.cwd, configResult.config, {
    rulesFiles: [],
    skillsDir,
    baselineMode: "off",
  });
  if (!prepared.ok) {
    io.stderr(`error: ${prepared.error}\n`);
    return 2;
  }

  const packs = createFsPackRepository(io.cwd);
  try {
    await packs.loadActive();
  } catch (err) {
    io.stderr(`error: lsp server failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const analyze = createLspAnalyzeFn(prepared.setup, packs);
  const server: LspServer = createLspServer({
    analyze,
    send: (text) => io.stdout(text),
    debounceMs,
    onExit: (code) => {
      process.exit(code);
    },
  });

  if (process.stdin.isTTY === true) {
    io.stderr("ankaa lsp: reading LSP frames from stdin (connect an editor client)\n");
  }
  process.stdin.on("data", (chunk: Buffer) => {
    server.handle(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  });
  process.stdin.on("end", () => {
    server.dispose();
    process.exit(0);
  });
  process.stdin.resume();

  await new Promise<void>(() => {});
  return 0;
}
