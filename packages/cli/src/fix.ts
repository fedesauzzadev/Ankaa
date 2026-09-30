import { parse as parseYaml } from "yaml";
import { redactText } from "@apigovscan/reporters";
import type { RuleExamples } from "@apigovscan/core";
import type { ChatMessage } from "./llm.js";

export type FixConfidence = "low" | "medium" | "high";

export interface ParsedFix {
  patch: string;
  explanation: string;
  confidence: FixConfidence;
}

export interface FixTarget {
  label?: string;
  pointer: string;
}

export interface SpecFragment {
  fragment: string;
  truncated: boolean;
}

const MAX_FRAGMENT_CHARS = 4000;

export function isUnifiedDiff(text: string): boolean {
  return /^--- .+/m.test(text) && /^\+\+\+ .+/m.test(text) && /^@@ .+ @@/m.test(text);
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json|diff)?[ \t]*\r?\n?/gim, "")
    .replace(/```[ \t]*$/gm, "")
    .trim();
}

function coerceConfidence(value: unknown): FixConfidence {
  return value === "low" || value === "medium" || value === "high" ? value : "low";
}

export function parseFixResponse(
  text: string,
): { ok: true; fix: ParsedFix } | { ok: false; error: string } {
  const cleaned = stripFences(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      const patch = raw.patch;
      if (typeof patch !== "string" || !isUnifiedDiff(patch)) {
        return { ok: false, error: "could not produce a valid patch" };
      }
      return {
        ok: true,
        fix: {
          patch,
          explanation: typeof raw.explanation === "string" ? raw.explanation : "",
          confidence: coerceConfidence(raw.confidence),
        },
      };
    } catch {
      // fall through to bare-diff tolerance below
    }
  }
  if (isUnifiedDiff(cleaned)) {
    return {
      ok: true,
      fix: { patch: cleaned, explanation: "", confidence: "low" },
    };
  }
  return { ok: false, error: "could not produce a valid patch" };
}

export function resolveFingerprint(
  fingerprints: readonly string[],
  input: string,
): { ok: true; fingerprint: string } | { ok: false; error: string } {
  const exact = fingerprints.find((f) => f === input);
  if (exact !== undefined) return { ok: true, fingerprint: exact };
  const prefixed = fingerprints.filter((f) => f.startsWith(input));
  if (prefixed.length === 1) return { ok: true, fingerprint: prefixed[0]! };
  if (prefixed.length === 0) return { ok: false, error: `finding not found: ${input}` };
  return {
    ok: false,
    error: `ambiguous fingerprint prefix "${input}" (matches ${prefixed.length} findings; use more chars)`,
  };
}

export function splitFindingTarget(location: string, labels: readonly string[]): FixTarget {
  const hash = location.indexOf("#");
  if (hash >= 0) {
    const label = location.slice(0, hash);
    if (labels.includes(label)) {
      return { label, pointer: location.slice(hash + 1) };
    }
  }
  return { pointer: location };
}

function navigatePointer(root: unknown, pointer: string): unknown {
  if (pointer === "") {
    return root;
  }
  if (!pointer.startsWith("/")) {
    return undefined;
  }
  let node: unknown = root;
  const segments = pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  for (const segment of segments) {
    if (Array.isArray(node)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) {
        return undefined;
      }
      node = node[index];
    } else if (node !== null && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (!(segment in record)) {
        return undefined;
      }
      node = record[segment];
    } else {
      return undefined;
    }
  }
  return node;
}

export function extractSpecFragment(
  specText: string,
  pointer: string,
  maxChars: number = MAX_FRAGMENT_CHARS,
): SpecFragment {
  let parsed: unknown;
  try {
    parsed = parseYaml(specText);
  } catch {
    return { fragment: "", truncated: false };
  }
  const node = navigatePointer(parsed, pointer);
  if (node === undefined) {
    return { fragment: "", truncated: false };
  }
  const text = JSON.stringify(node, null, 2) ?? "";
  if (text.length <= maxChars) {
    return { fragment: text, truncated: false };
  }
  return { fragment: `${text.slice(0, maxChars)}\n... (truncated)`, truncated: true };
}

export function buildFixMessages(opts: {
  fileLabel: string;
  ruleId: string;
  severity: string;
  message: string;
  location: string;
  fixHint?: string;
  examples?: RuleExamples;
  source?: { title: string; url?: string };
  fragment: string;
}): ChatMessage[] {
  const context = opts.fragment === "" ? "(context unavailable)" : redactText(opts.fragment);
  const system: ChatMessage = {
    role: "system",
    content: [
      "You are an OpenAPI governance assistant.",
      'Respond with ONLY valid JSON: {"patch": "<unified diff>", "explanation": "<1-2 sentences>", "confidence": "low"|"medium"|"high"}.',
      `The patch must be a unified diff for ${opts.fileLabel}, starting with "--- a/${opts.fileLabel}" and "+++ b/${opts.fileLabel}" headers.`,
      'Never invent other files. If you cannot produce a valid patch, respond with {"patch": "", "explanation": "<why>", "confidence": "low"}.',
    ].join("\n"),
  };
  const lines = [
    `file: ${opts.fileLabel}`,
    `rule: ${opts.ruleId} [${opts.severity}]`,
    `finding: ${redactText(opts.message)}`,
    `location: ${opts.location}`,
  ];
  if (opts.fixHint !== undefined) {
    lines.push(`fix hint: ${redactText(opts.fixHint)}`);
  }
  if (opts.examples?.bad !== undefined) {
    lines.push(`bad example:\n${redactText(opts.examples.bad)}`);
  }
  if (opts.examples?.good !== undefined) {
    lines.push(`good example:\n${redactText(opts.examples.good)}`);
  }
  if (opts.source !== undefined) {
    lines.push(
      `source: ${opts.source.title}${opts.source.url !== undefined ? ` (${opts.source.url})` : ""}`,
    );
  }
  lines.push("", "spec context (redacted):", context);
  return [system, { role: "user", content: lines.join("\n") }];
}
