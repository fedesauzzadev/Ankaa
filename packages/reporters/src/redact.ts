const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "***REDACTED***"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "***REDACTED***"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "***REDACTED***"],
  [/\b(password|secret|api[_-]?key|token)\s*[:=]\s*[^\s'"]{8,}/gi, "$1: ***REDACTED***"],
];

export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
