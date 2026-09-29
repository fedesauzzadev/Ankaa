import { createHmac } from "node:crypto";

const DEFAULT_SECRET = "ags-verify-2026";
const KEY_RE = /^AGS-([a-z0-9]{2,16})-(\d{8})-([0-9a-f]{12})$/;

export interface LicenseInfo {
  customer: string;
  /** YYYYMMDD */
  expiry: string;
}

export type LicenseCheck =
  | { ok: true; info: LicenseInfo }
  | {
      ok: false;
      reason: "missing" | "malformed" | "bad signature" | "expired";
    };

export function licenseSecret(): string {
  return process.env.APIGOVSCAN_LICENSE_SECRET ?? DEFAULT_SECRET;
}

export function generateLicenseKey(
  customer: string,
  expiry: string,
  secret: string = licenseSecret(),
): string {
  const sig = createHmac("sha256", secret)
    .update(`ags.v1.${customer}.${expiry}`)
    .digest("hex")
    .slice(0, 12);
  return `AGS-${customer}-${expiry}-${sig}`;
}

function clean(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function resolveLicenseKey(src: {
  flag?: string;
  env?: string;
  config?: string;
}): string | undefined {
  return clean(src.flag) ?? clean(src.env) ?? clean(src.config);
}

export function checkLicense(src: { flag?: string; env?: string; config?: string }): LicenseCheck {
  const key = resolveLicenseKey(src);
  if (key === undefined) {
    return { ok: false, reason: "missing" };
  }
  return verifyLicenseKey(key);
}

export function verifyLicenseKey(key: string, today?: string): LicenseCheck {
  const match = KEY_RE.exec(key);
  if (match === null) {
    return { ok: false, reason: "malformed" };
  }
  const customer = match[1]!;
  const expiry = match[2]!;
  const sig = match[3]!;
  const expected = createHmac("sha256", licenseSecret())
    .update(`ags.v1.${customer}.${expiry}`)
    .digest("hex")
    .slice(0, 12);
  if (sig !== expected) {
    return { ok: false, reason: "bad signature" };
  }
  const now = (today ?? new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  if (expiry < now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, info: { customer, expiry } };
}

export function licenseErrorMessage(check: Exclude<LicenseCheck, { ok: true }>): string {
  switch (check.reason) {
    case "missing":
      return "missing license: set --license-key, APIGOVSCAN_LICENSE_KEY or license.key in apigovscan.yaml";
    case "malformed":
      return "invalid license: malformed key (expected AGS-<customer>-<YYYYMMDD>-<sig>)";
    case "bad signature":
      return "invalid license: bad signature";
    case "expired":
      return "invalid license: expired";
  }
}

/** Dev license embedded for this repo's own tests/CI (valid until 2099). */
export const DEV_LICENSE_KEY = generateLicenseKey("dev", "20991231");
