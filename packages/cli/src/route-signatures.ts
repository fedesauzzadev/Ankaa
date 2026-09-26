export interface DetectedRoute {
  method: string;
  path: string;
  file: string;
  framework: string;
  line?: number;
}

interface Signature {
  framework: string;
  extensions: string[];
  match: (
    content: string,
    emit: (route: { method: string; path: string; line: number }) => void,
  ) => void;
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

function stripFullLineComments(content: string): string {
  return content
    .split("\n")
    .map((line) => (/^\s*(\/\/|#(?!\[)|\*)/.test(line) ? "" : line))
    .join("\n");
}

function methodList(text: string): string[] {
  const found = [...text.matchAll(/["']([A-Za-z]+)["']/g)].map((m) =>
    m[1]!.toUpperCase(),
  );
  return found.length > 0 ? found : ["*"];
}

function generic(
  framework: string,
  extensions: string[],
  patterns: Array<{
    re: RegExp;
    methods: (m: RegExpMatchArray) => string[];
    path: (m: RegExpMatchArray) => string | undefined;
  }>,
): Signature {
  return {
    framework,
    extensions,
    match(content, emit) {
      for (const { re, methods, path } of patterns) {
        re.lastIndex = 0;
        let m: RegExpMatchArray | null;
        while ((m = re.exec(content)) !== null) {
          const p = path(m);
          if (p === undefined) continue;
          const line = lineOf(content, m.index ?? 0);
          for (const method of methods(m)) {
            emit({ method, path: p, line });
          }
          if (m[0].length === 0) re.lastIndex++;
        }
      }
    },
  };
}

const EXPRESS_METHODS = "get|post|put|patch|delete|head|options";

const SIGNATURES: Signature[] = [
  generic("express", [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"], [
    {
      re: new RegExp(
        `(?:^|[^\\w$.])(?:app|router|server|api|fastify)\\s*\\.\\s*(${EXPRESS_METHODS})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
        "gim",
      ),
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
    {
      re: /@(?:Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*['"`]([^'"`]+)['"`]/gim,
      methods: (m) => [m[0].slice(1, m[0].indexOf("(")).toUpperCase()],
      path: (m) => m[1],
    },
    {
      re: /\.route\s*\(\s*['"`]([^'"`]+)['"`]/gim,
      methods: () => ["*"],
      path: (m) => m[1],
    },
  ]),
  generic("spring", [".java"], [
    {
      re: /@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/gim,
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
    {
      re: /@RequestMapping\s*\(([^)]*)\)/gim,
      methods: (m) => {
        const found = [...m[1]!.matchAll(/RequestMethod\.([A-Z]+)/g)].map(
          (x) => x[1]!,
        );
        return found.length > 0 ? found : ["*"];
      },
      path: (m) => {
        const p = m[1]!.match(/["']([^"']+)["']/);
        return p?.[1];
      },
    },
    {
      re: /@Path\s*\(\s*["']([^"']+)["']\s*\)/gim,
      methods: () => ["*"],
      path: (m) => m[1],
    },
  ]),
  generic("dotnet", [".cs"], [
    {
      re: /\[(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|HttpHead|HttpOptions)(?:\(\s*"([^"]*)"\s*\))?\]/gim,
      methods: (m) => [m[1]!.slice(4).toUpperCase()],
      path: (m) => (m[2] !== undefined && m[2] !== "" ? m[2] : undefined),
    },
    {
      re: /\[Route\s*\(\s*"([^"]+)"\s*\)\]/gim,
      methods: () => ["*"],
      path: (m) => m[1],
    },
    {
      re: /Map(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"/gim,
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
  ]),
  generic("python", [".py"], [
    {
      re: new RegExp(
        `@(?:app|router|api|blueprint|bp)\\s*\\.\\s*(${EXPRESS_METHODS})\\s*\\(\\s*['"]([^'"]+)['"]`,
        "gim",
      ),
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
    {
      re: /@\w+\.route\s*\(\s*['"]([^'"]+)['"]((?:[^)]*?methods\s*=\s*\[([^\]]*)\])?)/gim,
      methods: (m) => (m[2] !== undefined && m[2] !== "" ? methodList(m[3] ?? "") : ["*"]),
      path: (m) => m[1],
    },
    {
      re: /(?:path|re_path|url)\s*\(\s*r?['"]([^'"]+)['"]/gim,
      methods: () => ["*"],
      path: (m) => m[1],
    },
  ]),
  generic("rails", [".rb"], [
    {
      re: new RegExp(
        `^\\s*(${EXPRESS_METHODS})\\s+['"]([^'"]+)['"]`,
        "gim",
      ),
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
  ]),
  {
    framework: "rails",
    extensions: [".rb"],
    match(content, emit) {
      const re = /^\s*resources\s+:(\w+)/gim;
      let m: RegExpMatchArray | null;
      while ((m = re.exec(content)) !== null) {
        const line = lineOf(content, m.index ?? 0);
        const base = `/${m[1]}`;
        const member = `/${m[1]}/{id}`;
        for (const [method, path] of [
          ["GET", base],
          ["POST", base],
          ["GET", member],
          ["PATCH", member],
          ["PUT", member],
          ["DELETE", member],
        ] as Array<[string, string]>) {
          emit({ method, path, line });
        }
      }
    },
  },
  generic("go", [".go"], [
    {
      re: /http\.HandleFunc\s*\(\s*"([^"]+)"/gim,
      methods: () => ["*"],
      path: (m) => m[1],
    },
    {
      re: /\.HandleFunc\s*\(\s*"([^"]+)"\s*,[^\n;]*?\.Methods\s*\(([^)]*)\)/gim,
      methods: (m) => methodList(m[2] ?? ""),
      path: (m) => m[1],
    },
    {
      re: /\.HandleFunc\s*\(\s*"([^"]+)"\s*,(?![^\n;]*?\.Methods\s*\()/gim,
      methods: () => ["*"],
      path: (m) => m[1],
    },
    {
      re: /\.(GET|POST|PUT|DELETE|PATCH|HEAD)\s*\(\s*"([^"]+)"/gim,
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
    {
      re: /\.(Get|Post|Put|Delete|Patch|Head)\s*\(\s*"([^"]+)"/gim,
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
  ]),
  generic("php", [".php"], [
    {
      re: /Route::(get|post|put|patch|delete|options)\s*\(\s*['"]([^'"]+)['"]/gim,
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
    {
      re: /#\[\s*Route\s*\(\s*['"]([^'"]+)['"]((?:[^\]]*?methods\s*:\s*\[([^\]]*)\])?)/gim,
      methods: (m) => (m[2] !== undefined && m[2] !== "" ? methodList(m[3] ?? "") : ["*"]),
      path: (m) => m[1],
    },
    {
      re: /\$app->(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gim,
      methods: (m) => [m[1]!.toUpperCase()],
      path: (m) => m[2],
    },
  ]),
];

const EXTENSION_MAP = new Map<string, Signature[]>();
for (const sig of SIGNATURES) {
  for (const ext of sig.extensions) {
    const list = EXTENSION_MAP.get(ext) ?? [];
    list.push(sig);
    EXTENSION_MAP.set(ext, list);
  }
}

function extensionOf(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot >= 0 ? file.slice(dot).toLowerCase() : "";
}

export function normalizeRoutePath(path: string): string {
  let out = path.trim();
  if (out.startsWith("^")) out = out.slice(1);
  if (out.endsWith("$") && out.length > 1) out = out.slice(0, -1);
  out = out.replace(/\(\?P<(\w+)>[^)]*\)/g, "{$1}");
  out = out.replace(/<(?:\w+:)?(\w+)>/g, "{$1}");
  out = out.replace(/:([A-Za-z_]\w*)/g, "{$1}");
  if (!out.startsWith("/")) out = `/${out}`;
  out = out.replace(/\/{2,}/g, "/");
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

export function detectRoutes(file: string, content: string): DetectedRoute[] {
  const sigs = EXTENSION_MAP.get(extensionOf(file)) ?? [];
  const cleaned = stripFullLineComments(content);
  const seen = new Set<string>();
  const routes: DetectedRoute[] = [];
  for (const sig of sigs) {
    sig.match(cleaned, ({ method, path, line }) => {
      const normalized = normalizeRoutePath(path);
      const key = `${method} ${normalized} ${file}`;
      if (seen.has(key)) return;
      seen.add(key);
      routes.push({ method, path: normalized, file, framework: sig.framework, line });
    });
  }
  routes.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : a.method > b.method ? 1 : 0,
  );
  return routes;
}
