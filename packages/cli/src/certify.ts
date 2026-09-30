import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { packageVersion } from "@ankaa/core";
import { loadConfig } from "./config.js";
import { checkLicense, licenseErrorMessage } from "./license.js";

export const ATTESTATION_VERSION = 1;

const HEX64 = /^[0-9a-f]{64}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const ATTESTATION_KEYS = [
  "algorithm",
  "publicKeyFingerprint",
  "reportSha256",
  "signature",
  "tool",
  "version",
].sort();

export interface Attestation {
  version: 1;
  algorithm: "ed25519";
  reportSha256: string;
  signature: string;
  publicKeyFingerprint: string;
  tool: { name: "ankaa"; version: string };
}

export type AttestationLoadResult =
  | { ok: true; attestation: Attestation }
  | { ok: false; error: string };

export function generateKeyPairPems(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function spkiFingerprint(publicKey: KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

export function publicKeyFingerprint(publicPem: string): string {
  return spkiFingerprint(createPublicKey(publicPem));
}

export function privateKeyFingerprint(privatePem: string): string {
  return spkiFingerprint(createPublicKey(createPrivateKey(privatePem)));
}

function loadPublicPem(path: string): { ok: true; pem: string } | { ok: false; error: string } {
  let pem: string;
  try {
    pem = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: `public key not found: ${path}` };
  }
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") {
      return { ok: false, error: `public key is ${key.asymmetricKeyType}, expected ed25519` };
    }
    return { ok: true, pem };
  } catch {
    return { ok: false, error: `invalid public key PEM: ${path}` };
  }
}

export function buildAttestation(input: {
  reportBytes: Buffer;
  privatePem: string;
  toolVersion: string;
}): { ok: true; attestation: Attestation } | { ok: false; error: string } {
  const loaded = loadPrivateKeyFromPem(input.privatePem);
  if (!loaded.ok) return loaded;
  const signature = cryptoSign(null, input.reportBytes, loaded.key);
  const attestation: Attestation = {
    version: ATTESTATION_VERSION,
    algorithm: "ed25519",
    reportSha256: createHash("sha256").update(input.reportBytes).digest("hex"),
    signature: signature.toString("base64"),
    publicKeyFingerprint: spkiFingerprint(createPublicKey(loaded.key)),
    tool: { name: "ankaa", version: input.toolVersion },
  };
  return { ok: true, attestation };
}

function loadPrivateKeyFromPem(pem: string): { ok: true; key: KeyObject } | { ok: false; error: string } {
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "ed25519") {
      return { ok: false, error: `private key is ${key.asymmetricKeyType}, expected ed25519` };
    }
    return { ok: true, key };
  } catch {
    return { ok: false, error: "invalid private key PEM" };
  }
}

export function attestationJson(attestation: Attestation): string {
  return `${JSON.stringify(attestation, null, 2)}\n`;
}

export function loadAttestation(path: string): AttestationLoadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: `attestation not found: ${path}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: `attestation is not valid JSON: ${path} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `attestation ${path}: root must be an object` };
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  if (JSON.stringify(keys) !== JSON.stringify(ATTESTATION_KEYS)) {
    return {
      ok: false,
      error: `attestation ${path}: unexpected keys (expected exactly ${ATTESTATION_KEYS.join(", ")})`,
    };
  }
  if (obj.version !== ATTESTATION_VERSION) {
    return { ok: false, error: `attestation ${path}: unsupported version ${String(obj.version)}` };
  }
  if (obj.algorithm !== "ed25519") {
    return { ok: false, error: `attestation ${path}: unsupported algorithm ${String(obj.algorithm)}` };
  }
  if (typeof obj.reportSha256 !== "string" || !HEX64.test(obj.reportSha256)) {
    return { ok: false, error: `attestation ${path}: reportSha256 must be 64 hex chars` };
  }
  if (typeof obj.publicKeyFingerprint !== "string" || !HEX64.test(obj.publicKeyFingerprint)) {
    return { ok: false, error: `attestation ${path}: publicKeyFingerprint must be 64 hex chars` };
  }
  if (typeof obj.signature !== "string" || !BASE64_RE.test(obj.signature)) {
    return { ok: false, error: `attestation ${path}: signature must be base64` };
  }
  const sigBytes = Buffer.from(obj.signature as string, "base64");
  if (sigBytes.length !== 64) {
    return {
      ok: false,
      error: `attestation ${path}: signature must decode to 64 bytes (ed25519), got ${sigBytes.length}`,
    };
  }
  const tool = obj.tool;
  if (tool === null || typeof tool !== "object" || Array.isArray(tool)) {
    return { ok: false, error: `attestation ${path}: tool must be a mapping` };
  }
  const toolObj = tool as Record<string, unknown>;
  const toolKeys = Object.keys(toolObj).sort();
  if (JSON.stringify(toolKeys) !== JSON.stringify(["name", "version"])) {
    return { ok: false, error: `attestation ${path}: tool must have exactly name and version` };
  }
  if (toolObj.name !== "ankaa" || typeof toolObj.version !== "string" || toolObj.version.length === 0) {
    return { ok: false, error: `attestation ${path}: tool.name must be "ankaa" and version non-empty` };
  }
  return {
    ok: true,
    attestation: {
      version: 1,
      algorithm: "ed25519",
      reportSha256: obj.reportSha256 as string,
      signature: obj.signature as string,
      publicKeyFingerprint: obj.publicKeyFingerprint as string,
      tool: { name: "ankaa", version: toolObj.version as string },
    },
  };
}

export function verifyAttestation(input: {
  reportBytes: Buffer;
  attestation: Attestation;
  publicPem: string;
}): { ok: true } | { ok: false; error: string } {
  const fingerprint = publicKeyFingerprint(input.publicPem);
  if (fingerprint !== input.attestation.publicKeyFingerprint) {
    return {
      ok: false,
      error: `public key fingerprint mismatch (attestation ${input.attestation.publicKeyFingerprint.slice(0, 12)}…, key ${fingerprint.slice(0, 12)}…)`,
    };
  }
  const hash = createHash("sha256").update(input.reportBytes).digest("hex");
  if (hash !== input.attestation.reportSha256) {
    return { ok: false, error: "report bytes changed since certification (sha256 mismatch)" };
  }
  const signature = Buffer.from(input.attestation.signature, "base64");
  const valid = cryptoVerify(
    null,
    input.reportBytes,
    createPublicKey(input.publicPem),
    signature,
  );
  if (!valid) {
    return { ok: false, error: "signature does not verify (ed25519)" };
  }
  return { ok: true };
}

const CERTIFY_USAGE = [
  "Usage:",
  "  ankaa certify --report <r.json> --key <private.pem> [--out <a.json>] [--force]",
  "  ankaa certify --gen-keys --private-out <f.pem> --public-out <f.pem> [--force]",
  "",
  "Sign a report (ed25519 detached) or generate a key pair.",
  "verify is ungated; certify requires a license like analyze.",
  "",
].join("\n");

export function runCertifyCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
    env?: Record<string, string | undefined>;
  },
): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(CERTIFY_USAGE);
    return 0;
  }

  let genKeys = false;
  let reportPath: string | undefined;
  let keyPath: string | undefined;
  let outPath: string | undefined;
  let privateOut: string | undefined;
  let publicOut: string | undefined;
  let force = false;
  let configPath: string | undefined;
  let licenseKey: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--gen-keys") {
      genKeys = true;
      continue;
    }
    if (token === "--force") {
      force = true;
      continue;
    }
    if (
      token === "--report" ||
      token === "--key" ||
      token === "--out" ||
      token === "--private-out" ||
      token === "--public-out" ||
      token === "--config" ||
      token === "--license-key"
    ) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr(`error: ${token} requires a value\n`);
        return 2;
      }
      if (token === "--report") reportPath = v;
      else if (token === "--key") keyPath = v;
      else if (token === "--out") outPath = v;
      else if (token === "--private-out") privateOut = v;
      else if (token === "--public-out") publicOut = v;
      else if (token === "--config") configPath = v;
      else licenseKey = v;
      continue;
    }
    if (token === "--no-color") {
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    io.stderr(`error: unexpected argument: ${token}\n`);
    return 2;
  }

  if (genKeys) {
    if (privateOut === undefined || publicOut === undefined) {
      io.stderr("error: --gen-keys requires --private-out and --public-out\n");
      return 2;
    }
    if (reportPath !== undefined || keyPath !== undefined || outPath !== undefined) {
      io.stderr("error: --gen-keys does not take --report/--key/--out\n");
      return 2;
    }
    const privAbs = resolve(io.cwd, privateOut);
    const pubAbs = resolve(io.cwd, publicOut);
    if (!force && (existsSync(privAbs) || existsSync(pubAbs))) {
      io.stderr("error: key file already exists (use --force to overwrite)\n");
      return 2;
    }
    const pair = generateKeyPairPems();
    try {
      writeFileSync(privAbs, pair.privatePem, "utf8");
      writeFileSync(pubAbs, pair.publicPem, "utf8");
    } catch (err) {
      io.stderr(
        `error: cannot write keys: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    io.stdout(`wrote: ${privAbs}\n`);
    io.stdout(`wrote: ${pubAbs}\n`);
    io.stdout(`public key fingerprint: ${publicKeyFingerprint(pair.publicPem)}\n`);
    return 0;
  }

  if (reportPath === undefined || keyPath === undefined) {
    io.stderr("error: certify requires --report and --key\n");
    return 2;
  }

  const configResult = loadConfig(io.cwd, configPath);
  if (!configResult.ok) {
    io.stderr(`error: ${configResult.error}\n`);
    return 2;
  }
  const license = checkLicense({
    flag: licenseKey,
    env: io.env?.ANKAA_LICENSE_KEY,
    config: configResult.config.license?.key,
  });
  if (!license.ok) {
    io.stderr(`error: ${licenseErrorMessage(license)}\n`);
    return 2;
  }

  const reportAbs = resolve(io.cwd, reportPath);
  let reportBytes: Buffer;
  try {
    reportBytes = readFileSync(reportAbs);
  } catch {
    io.stderr(`error: report not found: ${reportPath}\n`);
    return 2;
  }
  try {
    const parsed = JSON.parse(reportBytes.toString("utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      io.stderr(`error: report ${reportPath}: root must be a JSON object\n`);
      return 2;
    }
  } catch (err) {
    io.stderr(
      `error: report ${reportPath}: not valid JSON (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return 2;
  }

  let privatePem: string;
  try {
    privatePem = readFileSync(resolve(io.cwd, keyPath), "utf8");
  } catch {
    io.stderr(`error: private key not found: ${keyPath}\n`);
    return 2;
  }

  const built = buildAttestation({
    reportBytes,
    privatePem,
    toolVersion: packageVersion(),
  });
  if (!built.ok) {
    io.stderr(`error: ${built.error}\n`);
    return 2;
  }

  const serialized = attestationJson(built.attestation);
  if (outPath !== undefined) {
    const outAbs = resolve(io.cwd, outPath);
    if (!force && existsSync(outAbs)) {
      io.stderr(`error: ${outPath} already exists (use --force to overwrite)\n`);
      return 2;
    }
    try {
      writeFileSync(outAbs, serialized, "utf8");
    } catch (err) {
      io.stderr(
        `error: cannot write ${outPath}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    io.stdout(`wrote: ${outAbs}\n`);
  } else {
    io.stdout(serialized);
  }
  return 0;
}

const VERIFY_USAGE = [
  "Usage:",
  "  ankaa verify --report <r.json> --attestation <a.json> --key <public.pem>",
  "",
  "Verify an attestation against the raw report bytes and the pinned public key.",
  "Exit 0 valid · 1 tampered/mismatch · 2 operational error. No license needed.",
  "",
].join("\n");

export function runVerifyCommand(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
  },
): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(VERIFY_USAGE);
    return 0;
  }

  let reportPath: string | undefined;
  let attestationPath: string | undefined;
  let keyPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--report" || token === "--attestation" || token === "--key") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        io.stderr(`error: ${token} requires a file path\n`);
        return 2;
      }
      if (token === "--report") reportPath = v;
      else if (token === "--attestation") attestationPath = v;
      else keyPath = v;
      continue;
    }
    if (token === "--no-color") {
      continue;
    }
    if (token.startsWith("-")) {
      io.stderr(`error: unknown option: ${token}\n`);
      return 2;
    }
    io.stderr(`error: unexpected argument: ${token}\n`);
    return 2;
  }

  if (reportPath === undefined || attestationPath === undefined || keyPath === undefined) {
    io.stderr("error: verify requires --report, --attestation and --key\n");
    return 2;
  }

  let reportBytes: Buffer;
  try {
    reportBytes = readFileSync(resolve(io.cwd, reportPath));
  } catch {
    io.stderr(`error: report not found: ${reportPath}\n`);
    return 2;
  }

  const attestation = loadAttestation(resolve(io.cwd, attestationPath));
  if (!attestation.ok) {
    io.stderr(`error: ${attestation.error}\n`);
    return 2;
  }

  const publicPem = loadPublicPem(resolve(io.cwd, keyPath));
  if (!publicPem.ok) {
    io.stderr(`error: ${publicPem.error}\n`);
    return 2;
  }

  const result = verifyAttestation({
    reportBytes,
    attestation: attestation.attestation,
    publicPem: publicPem.pem,
  });
  if (!result.ok) {
    io.stderr(`error: ${result.error}\n`);
    return 1;
  }

  io.stdout(
    [
      `verified: ${reportPath}`,
      `  report sha256    ${attestation.attestation.reportSha256.slice(0, 16)}…`,
      `  key fingerprint  ${attestation.attestation.publicKeyFingerprint.slice(0, 16)}…`,
      "  signature        ed25519 ok",
      "",
    ].join("\n"),
  );
  return 0;
}
