import { createServer, type IncomingMessage, type Server } from "node:http";

export interface StubRequest {
  method?: string;
  path?: string;
  authorization?: string;
  body: string;
}

export interface StubOptions {
  response?: unknown;
  status?: number;
  rawBody?: string;
  delayMs?: number;
}

export interface LlmStub {
  url: string;
  requests: StubRequest[];
  close: () => Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function stubCompletion(opts?: StubOptions): unknown {
  return (
    opts?.response ?? {
      choices: [
        {
          message: {
            content: JSON.stringify({
              patch: [
                "--- a/openapi.yaml",
                "+++ b/openapi.yaml",
                "@@ -1,1 +1,1 @@",
                "-x: 1",
                "+x: 2",
              ].join("\n"),
              explanation: "Use a valid response code.",
              confidence: "high",
            }),
          },
        },
      ],
    }
  );
}

export async function startLlmStub(opts?: StubOptions): Promise<LlmStub> {
  const requests: StubRequest[] = [];
  const server: Server = createServer(async (req, res) => {
    const body = await readBody(req);
    requests.push({
      ...(req.method !== undefined ? { method: req.method } : {}),
      ...(req.url !== undefined ? { path: req.url } : {}),
      ...(typeof req.headers.authorization === "string"
        ? { authorization: req.headers.authorization }
        : {}),
      body,
    });
    if (opts?.delayMs !== undefined && opts.delayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    if (req.method !== "POST" || req.url !== "/chat/completions") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const status = opts?.status ?? 200;
    if (opts?.rawBody !== undefined) {
      res.writeHead(status, { "content-type": "text/plain" });
      res.end(opts.rawBody);
      return;
    }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(stubCompletion(opts)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
