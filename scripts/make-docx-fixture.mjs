/**
 * One-time fixture generator: renders fixtures/guideline.md to
 * fixtures/guideline.docx so all three guideline fixtures share the norms.
 * Usage: node scripts/make-docx-fixture.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(root, "fixtures", "guideline.md"), "utf8");
const out = join(root, "fixtures", "guideline.docx");

const children = [];
for (const para of text.split(/\r?\n\s*\r?\n/)) {
  const line = para.trim().replace(/\s+/g, " ");
  if (line.startsWith("# ")) {
    children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.TITLE }));
  } else if (line.startsWith("## ")) {
    children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
  } else {
    children.push(new Paragraph(line));
  }
}
const buffer = await Packer.toBuffer(new Document({ sections: [{ children }] }));
writeFileSync(out, buffer);
console.log(`wrote ${out}`);
