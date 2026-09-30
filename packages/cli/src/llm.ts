export interface LlmConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_TIMEOUT_MS = 30000;

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readMapping(config: unknown): { baseUrl?: unknown; apiKey?: unknown; model?: unknown } {
  if (config === undefined) {
    return {};
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("llm must be a mapping");
  }
  return config as { baseUrl?: unknown; apiKey?: unknown; model?: unknown };
}

export function loadLlmConfig(
  config: unknown,
  env: Record<string, string | undefined>,
): LlmConfig | undefined {
  const raw = readMapping(config);
  const baseUrl = clean(env.ANKAA_LLM_BASE_URL) ?? clean(raw.baseUrl);
  if (baseUrl === undefined) {
    return undefined;
  }
  const apiKey = clean(env.ANKAA_LLM_API_KEY) ?? clean(raw.apiKey);
  const model = clean(env.ANKAA_LLM_MODEL) ?? clean(raw.model);
  const cfg: LlmConfig = { baseUrl };
  if (apiKey !== undefined) {
    cfg.apiKey = apiKey;
  }
  if (model !== undefined) {
    cfg.model = model;
  }
  return cfg;
}

export async function chatCompletion(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts?: { timeoutMs?: number },
): Promise<string> {
  if (cfg.model === undefined) {
    throw new Error("llm.model is not configured (set llm.model or ANKAA_LLM_MODEL)");
  }
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cfg.apiKey !== undefined ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: cfg.model, messages }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`llm request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`llm request failed: HTTP ${res.status}`);
  }
  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch {
    throw new Error("invalid llm response: expected JSON");
  }
  const choices =
    typeof body === "object" && body !== null ? (body as { choices?: unknown }).choices : undefined;
  const content =
    Array.isArray(choices) && choices.length > 0
      ? (choices[0] as { message?: { content?: unknown } })?.message?.content
      : undefined;
  if (typeof content !== "string") {
    throw new Error("invalid llm response: missing choices[0].message.content");
  }
  return content;
}
