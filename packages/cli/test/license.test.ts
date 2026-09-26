import { describe, expect, it } from "vitest";
import {
  DEV_LICENSE_KEY,
  checkLicense,
  generateLicenseKey,
  licenseErrorMessage,
  resolveLicenseKey,
  verifyLicenseKey,
} from "../src/license.js";
import { loadConfigFromText } from "../src/config.js";

describe("verifyLicenseKey (f6-distribution)", () => {
  it("AC-D.1 accepts a key generated with the embedded secret", () => {
    const key = generateLicenseKey("acme", "20991231");
    expect(verifyLicenseKey(key, "20260926")).toEqual({
      ok: true,
      info: { customer: "acme", expiry: "20991231" },
    });
  });

  it("AC-D.1 rejects a tampered signature", () => {
    const key = generateLicenseKey("acme", "20991231");
    const tampered = key.slice(0, -1) + (key.endsWith("0") ? "1" : "0");
    expect(verifyLicenseKey(tampered, "20260926")).toEqual({
      ok: false,
      reason: "bad signature",
    });
  });

  it("AC-D.1 rejects expired keys", () => {
    const key = generateLicenseKey("acme", "20200101");
    expect(verifyLicenseKey(key, "20260926")).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("AC-D.1 rejects malformed keys", () => {
    expect(verifyLicenseKey("hello", "20260926")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifyLicenseKey("AGS-ACME-20991231-abcdefabcdef", "20260926")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("expiry boundary: same day is valid, previous day is expired", () => {
    const key = generateLicenseKey("acme", "20260926");
    expect(verifyLicenseKey(key, "20260926").ok).toBe(true);
    expect(verifyLicenseKey(key, "20260927")).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("AC-D.2 resolution order flag > env > config", () => {
    const flag = generateLicenseKey("flagc", "20991231");
    const env = generateLicenseKey("envc", "20991231");
    const config = generateLicenseKey("cfgc", "20991231");
    expect(resolveLicenseKey({ flag, env, config })).toBe(flag);
    expect(resolveLicenseKey({ env, config })).toBe(env);
    expect(resolveLicenseKey({ config })).toBe(config);
    expect(resolveLicenseKey({})).toBeUndefined();
    expect(checkLicense({ flag }).ok).toBe(true);
    expect(checkLicense({})).toEqual({ ok: false, reason: "missing" });
  });

  it("messages are actionable", () => {
    expect(licenseErrorMessage({ ok: false, reason: "missing" })).toContain(
      "APIGOVSCAN_LICENSE_KEY",
    );
    expect(
      licenseErrorMessage({ ok: false, reason: "bad signature" }),
    ).toContain("bad signature");
  });

  it("AC-D.10 verification never touches network APIs", () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network disabled (INV-1)");
    }) as typeof fetch;
    try {
      expect(verifyLicenseKey(DEV_LICENSE_KEY, "20260926").ok).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("config license.key (f6-distribution)", () => {
  it("AC-D.6 accepts license.key in strict schema", () => {
    const result = loadConfigFromText(
      `license:\n  key: "${DEV_LICENSE_KEY}"\n`,
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.license?.key).toBe(DEV_LICENSE_KEY);
    }
  });

  it("AC-D.6 rejects unknown keys under license", () => {
    const result = loadConfigFromText(
      "license:\n  keys: nope\n",
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('license: unknown key "keys"');
    }
  });

  it("AC-D.6 rejects non-string license.key", () => {
    const result = loadConfigFromText("license:\n  key: 42\n", "apigovscan.yaml");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("license.key must be a non-empty string");
    }
  });
});
