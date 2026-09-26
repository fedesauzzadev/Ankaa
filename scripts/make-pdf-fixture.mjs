/**
 * One-time fixture generator: renders fixtures/guideline.md to
 * fixtures/guideline.pdf as a minimal hand-written PDF 1.4 (classic xref),
 * so all three guideline fixtures share the norms and pdf-parse can read it.
 * Usage: node scripts/make-pdf-fixture.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(root, "fixtures", "guideline.md"), "utf8");
const out = join(root, "fixtures", "guideline.pdf");

function latin1(line) {
  return line.replace(/[^\x20-\x7E]/g, "?");
}

function escapePdf(line) {
  return latin1(line).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(line, width) {
  const words = line.split(/\s+/).filter((w) => w.length > 0);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length > width && current !== "") {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

const contentLines = [];
for (const para of text.split(/\r?\n\s*\r?\n/)) {
  const line = para.trim().replace(/\s+/g, " ");
  if (line === "") continue;
  if (line.startsWith("# ")) {
    contentLines.push({ size: 18, text: line.slice(2) });
  } else if (line.startsWith("## ")) {
    contentLines.push({ size: 13, text: line.slice(3) });
  } else {
    for (const wrapped of wrap(line, 88)) {
      contentLines.push({ size: 11, text: wrapped });
    }
  }
  contentLines.push({ size: 11, text: " " });
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const LEADING = 15;

const pages = [];
let current = [];
let y = PAGE_H - MARGIN;
for (const { size, text: line } of contentLines) {
  const step = size > 11 ? LEADING + 4 : LEADING;
  if (y - step < MARGIN) {
    pages.push(current);
    current = [];
    y = PAGE_H - MARGIN;
  }
  y -= step;
  current.push({ size, text: line, y });
}
pages.push(current);

let pdf = "%PDF-1.4\n";
const offsets = [];
function addObject(body) {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${offsets.length} 0 obj\n${body}\nendobj\n`;
  return offsets.length;
}

const fontId = 3;
const pageIds = [];
const contentIds = [];
for (let i = 0; i < pages.length; i++) {
  pageIds.push(3 + i * 2 + 1);
  contentIds.push(3 + i * 2 + 2);
}
// objects: 1 catalog, 2 pages, 3 font, then per page (page, content)
addObject("<< /Type /Catalog /Pages 2 0 R >>");
addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const streams = pages.map((lines) => {
  const ops = lines.map(
    ({ size, text: line, y: ly }) =>
      `BT /F1 ${size} Tf ${MARGIN} ${ly.toFixed(1)} Td (${escapePdf(line)}) Tj ET`,
  );
  return ops.join("\n");
});
for (let i = 0; i < pages.length; i++) {
  const stream = streams[i];
  addObject(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
  );
  addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
}

const xrefPos = Buffer.byteLength(pdf, "latin1");
const count = offsets.length + 1;
pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
for (const off of offsets) {
  pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

writeFileSync(out, Buffer.from(pdf, "latin1"));
console.log(`wrote ${out}`);
