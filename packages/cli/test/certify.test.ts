import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  attestationJson,
  buildAttestation,
  generateKeyPairPems,
  loadAttestation,
  publicKeyFingerprint,
  verifyAttestation,
} from "../src/certify.js";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-certify-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

async function runCapture(
  argv: string[],
  io: { cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await run(["node", "cli", ...argv], {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    isTTY: false,
    cwd: io.cwd ?? repoRoot,
  });
  return { code, stdout, stderr };
}

describe("certify unit (AC-CF.6/8)", () => {
  it("roundtrip: build verifies, attestation fields coherent", () => {
    const pair = generateKeyPairPems();
    const bytes = Buffer.from('{"findings":[],"reportHash":"abc"}\n', "utf8");
    const built = buildAttestation({ reportBytes: bytes, privatePem: pair.privatePem, toolVersion: "1.2.3" });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.attestation.algorithm).toBe("ed25519");
    expect(built.attestation.publicKeyFingerprint).toBe(publicKeyFingerprint(pair.publicPem));
    expect(
      verifyAttestation({ reportBytes: bytes, attestation: built.attestation, publicPem: pair.publicPem }).ok,
    ).toBe(true);
  });

  it("AC-CF.8 deterministic: same bytes + key ⇒ byte-identical attestation", () => {
    const pair = generateKeyPairPems();
    const bytes = Buffer.from("stable-bytes", "utf8");
    const a = buildAttestation({ reportBytes: bytes, privatePem: pair.privatePem, toolVersion: "1.0.0" });
    const b = buildAttestation({ reportBytes: bytes, privatePem: pair.privatePem, toolVersion: "1.0.0" });
    expect(attestationJson(a.attestation!)).toBe(attestationJson(b.attestation!));
  });

  it("tampered byte fails with a clear reason (AC-CF.4 unit)", () => {
    const pair = generateKeyPairPems();
    const bytes = Buffer.from("report-bytes", "utf8");
    const built = buildAttestation({ reportBytes: bytes, privatePem: pair.privatePem, toolVersion: "1.0.0" });
    const tampered = Buffer.from("report-byteS", "utf8");
    const result = verifyAttestation({ reportBytes: tampered, attestation: built.attestation!, publicPem: pair.publicPem });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("changed");
  });

  it("wrong public key fails on fingerprint before anything else (AC-CF.5 unit)", () => {
    const producer = generateKeyPairPems();
    const other = generateKeyPairPems();
    const bytes = Buffer.from("report-bytes", "utf8");
    const built = buildAttestation({ reportBytes: bytes, privatePem: producer.privatePem, toolVersion: "1.0.0" });
    const result = verifyAttestation({ reportBytes: bytes, attestation: built.attestation!, publicPem: other.publicPem });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("fingerprint mismatch");
  });

  it("AC-CF.6 loadAttestation rejects malformed shapes", () => {
    const dir = tempDir();
    const good = buildAttestation({
      reportBytes: Buffer.from("x", "utf8"),
      privatePem: generateKeyPairPems().privatePem,
      toolVersion: "1.0.0",
    }).attestation!;

    const extra = join(dir, "extra.json");
    writeFileSync(extra, JSON.stringify({ ...good, extra: 1 }), "utf8");
    expect(loadAttestation(extra).ok).toBe(false);

    const shortSig = join(dir, "short.json");
    writeFileSync(shortSig, JSON.stringify({ ...good, signature: "AAAA" }), "utf8");
    expect(loadAttestation(shortSig).ok).toBe(false);

    const badVersion = join(dir, "version.json");
    writeFileSync(badVersion, JSON.stringify({ ...good, version: 99 }), "utf8");
    expect(loadAttestation(badVersion).ok).toBe(false);

    const missing = join(dir, "nope.json");
    expect(loadAttestation(missing).ok).toBe(false);
  });
});

describe("certify/verify e2e (AC-CF.*)", () => {
  it("AC-CF.1 gen-keys writes a PEM pair and refuses overwrite without --force", async () => {
    const dir = tempDir();
    const priv = join(dir, "priv.pem");
    const pub = join(dir, "pub.pem");
    const first = await runCapture(
      ["certify", "--gen-keys", "--private-out", priv, "--public-out", pub],
      { cwd: dir },
    );
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("public key fingerprint:");
    expect(readFileSync(priv, "utf8")).toContain("PRIVATE KEY");
    expect(readFileSync(pub, "utf8")).toContain("PUBLIC KEY");

    const again = await runCapture(
      ["certify", "--gen-keys", "--private-out", priv, "--public-out", pub],
      { cwd: dir },
    );
    expect(again.code).toBe(2);
    expect(again.stderr).toContain("--force");

    const forced = await runCapture(
      ["certify", "--gen-keys", "--private-out", priv, "--public-out", pub, "--force"],
      { cwd: dir },
    );
    expect(forced.code).toBe(0);
  });

  it("AC-CF.2/3/4/5 full flow: analyze → certify → verify → tamper → cross-key", async () => {
    const dir = tempDir();
    const report = join(dir, "report.json");
    const analyzed = await runCapture(
      ["analyze", petstore, "--format", "json", "--output", report, "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(analyzed.code);
    const original = readFileSync(report);

    const priv = join(dir, "priv.pem");
    const pub = join(dir, "pub.pem");
    await runCapture(["certify", "--gen-keys", "--private-out", priv, "--public-out", pub], { cwd: dir });

    const attestation = join(dir, "attestation.json");
    const certified = await runCapture(
      ["certify", "--report", report, "--key", priv, "--out", attestation],
      { cwd: dir },
    );
    expect(certified.code).toBe(0);
    expect(certified.stdout).toContain("wrote:");

    const verified = await runCapture(
      ["verify", "--report", report, "--attestation", attestation, "--key", pub],
      { cwd: dir },
    );
    expect(verified.code).toBe(0);
    expect(verified.stdout).toContain("verified:");
    expect(verified.stdout).toContain("ed25519 ok");

    writeFileSync(report, Buffer.concat([original, Buffer.from(" ", "utf8")]));
    const tampered = await runCapture(
      ["verify", "--report", report, "--attestation", attestation, "--key", pub],
      { cwd: dir },
    );
    expect(tampered.code).toBe(1);
    expect(tampered.stderr).toContain("changed");
    writeFileSync(report, original);

    const pub2 = join(dir, "pub2.pem");
    await runCapture(
      ["certify", "--gen-keys", "--private-out", join(dir, "priv2.pem"), "--public-out", pub2],
      { cwd: dir },
    );
    const cross = await runCapture(
      ["verify", "--report", report, "--attestation", attestation, "--key", pub2],
      { cwd: dir },
    );
    expect(cross.code).toBe(1);
    expect(cross.stderr).toContain("fingerprint mismatch");
  });

  it("AC-CF.6 malformed attestation and bad key are exit 2", async () => {
    const dir = tempDir();
    const report = join(dir, "report.json");
    writeFileSync(report, '{"findings":[]}', "utf8");
    const bad = join(dir, "bad.json");
    writeFileSync(bad, '{"version":1,"unexpected":true}', "utf8");
    const notPem = join(dir, "not.pem");
    writeFileSync(notPem, "not a pem", "utf8");

    const badAttestation = await runCapture(
      ["verify", "--report", report, "--attestation", bad, "--key", notPem],
      { cwd: dir },
    );
    expect(badAttestation.code).toBe(2);
    expect(badAttestation.stderr).toContain("unexpected keys");

    const pub = join(dir, "pub.pem");
    await runCapture(["certify", "--gen-keys", "--private-out", join(dir, "p.pem"), "--public-out", pub], { cwd: dir });
    const badKey = await runCapture(
      ["verify", "--report", report, "--attestation", bad, "--key", notPem],
      { cwd: dir },
    );
    expect(badKey.code).toBe(2);
  });

  it("AC-CF.7 certify requires a license; verify does not", async () => {
    const dir = tempDir();
    const report = join(dir, "report.json");
    writeFileSync(report, '{"findings":[]}', "utf8");
    const pair = await runCapture(
      ["certify", "--gen-keys", "--private-out", join(dir, "p.pem"), "--public-out", join(dir, "pub.pem")],
      { cwd: dir },
    );
    expect(pair.code).toBe(0);

    const previous = process.env.ANKAA_LICENSE_KEY;
    delete process.env.ANKAA_LICENSE_KEY;
    try {
      const noLicense = await runCapture(
        ["certify", "--report", report, "--key", join(dir, "p.pem")],
        { cwd: dir },
      );
      expect(noLicense.code).toBe(2);
      expect(noLicense.stderr).toContain("missing license");
    } finally {
      if (previous !== undefined) {
        process.env.ANKAA_LICENSE_KEY = previous;
      }
    }

    const out = join(dir, "a.json");
    const licensed = await runCapture(
      ["certify", "--report", report, "--key", join(dir, "p.pem"), "--out", out, "--force"],
      { cwd: dir },
    );
    expect(licensed.code).toBe(0);

    delete process.env.ANKAA_LICENSE_KEY;
    try {
      const verified = await runCapture(
        ["verify", "--report", report, "--attestation", out, "--key", join(dir, "pub.pem")],
        { cwd: dir },
      );
      expect(verified.code).toBe(0);
    } finally {
      if (previous !== undefined) {
        process.env.ANKAA_LICENSE_KEY = previous;
      }
    }
  });

  it("AC-CF.8/9 deterministic attestations and INV-7 (only explicit files)", async () => {
    const dir = tempDir();
    const report = join(dir, "report.json");
    writeFileSync(report, '{"findings":[],"reportHash":"stable"}\n', "utf8");
    await runCapture(
      ["certify", "--gen-keys", "--private-out", join(dir, "p.pem"), "--public-out", join(dir, "pub.pem")],
      { cwd: dir },
    );
    const a1 = join(dir, "a1.json");
    const a2 = join(dir, "a2.json");
    await runCapture(["certify", "--report", report, "--key", join(dir, "p.pem"), "--out", a1], { cwd: dir });
    await runCapture(["certify", "--report", report, "--key", join(dir, "p.pem"), "--out", a2], { cwd: dir });
    expect(readFileSync(a1).equals(readFileSync(a2))).toBe(true);

    expect(readdirSync(dir).sort()).toEqual(["a1.json", "a2.json", "p.pem", "pub.pem", "report.json"]);
    expect(existsSync(join(dir, ".ankaa"))).toBe(false);
  });

  it("usage errors are exit 2 with guidance", async () => {
    const missing = await runCapture(["certify"], {});
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("--report and --key");

    const verifyMissing = await runCapture(["verify", "--report", "x.json"], {});
    expect(verifyMissing.code).toBe(2);
    expect(verifyMissing.stderr).toContain("--report, --attestation and --key");
  });
});
