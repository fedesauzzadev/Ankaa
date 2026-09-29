import { createHmac } from "node:crypto";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const key = t?.startsWith("--") ? t.slice(2) : undefined;
    if (key === undefined) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = value;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const customer = typeof args.customer === "string" ? args.customer : "";
const expiry = typeof args.expiry === "string" ? args.expiry : "";
const secret = typeof args.secret === "string" ? args.secret : "ags-verify-2026";

if (!/^[a-z0-9]{2,16}$/.test(customer)) {
  console.error("--customer required (2-16 lowercase alphanumeric, e.g. acme)");
  process.exit(2);
}
if (!/^\d{8}$/.test(expiry)) {
  console.error("--expiry required (YYYYMMDD, e.g. 2027-09-26 -> 20270926)");
  process.exit(2);
}

const sig = createHmac("sha256", secret)
  .update(`ags.v1.${customer}.${expiry}`)
  .digest("hex")
  .slice(0, 12);

console.log(`AGS-${customer}-${expiry}-${sig}`);
