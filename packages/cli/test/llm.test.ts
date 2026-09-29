import { afterEach, describe, expect, it } from "vitest";
import { chatCompletion, loadLlmConfig, type LlmConfig } from "../src/llm.js";
import { loadConfigFromText } from "../src/config.js";
import { startLlmStub } from "./llm-stub.js";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env.APIGOVSCAN_LLM_BASE_URL = savedEnv.APIGOVSCAN_LLM_BASE_URL;
  process.env.APIGOVSCAN_LLM_API_KEY = savedEnv.APIGOVSCAN_LLM_API_KEY;
  process.env.APIGOVSCAN_LLM_MODEL = savedEnv.APIGOVSCAN_LLM_MODEL;
});

describe("loadLlmConfig (AC-SF.1)", () => {
  it("env wins over config; empty strings are absent", () => {
    const config = { baseUrl: "http://config:1", apiKey: "ck", model: "cm" };
    const env = {
      APIGOVSCAN_LLM_BASE_URL: "http://env:2",
      APIGOVSCAN_LLM_API_KEY: "",
      APIGOVSCAN_LLM_MODEL: "em",
    };
    expect(loadLlmConfig(config, env)).toEqual({
      baseUrl: "http://env:2",
      apiKey: "ck",
      model: "em",
    });
    expect(loadLlmConfig(config, {})).toEqual({
      baseUrl: "http://config:1",
      apiKey: "ck",
      model: "cm",
    });
    expect(loadLlmConfig(undefined, {})).toBeUndefined();
    expect(loadLlmConfig({}, {})).toBeUndefined();
  });

  it("rejects non-mapping config", () => {
    expect(() => loadLlmConfig("nope", {})).toThrow("llm must be a mapping");
    expect(() => loadLlmConfig([], {})).toThrow("llm must be a mapping");
  });
});

describe("config schema llm block (AC-SF.2)", () => {
  it("accepts llm baseUrl/apiKey/model", () => {
    const result = loadConfigFromText(
      [
        "llm:",
        "  baseUrl: http://localhost:11434/v1",
        "  apiKey: secret",
        "  model: test-model",
      ].join("\n"),
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.llm).toEqual({
        baseUrl: "http://localhost:11434/v1",
        apiKey: "secret",
        model: "test-model",
      });
    }
  });

  it("rejects unknown llm keys", () => {
    const result = loadConfigFromText("llm:\n  url: http://x\n", "apigovscan.yaml");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('config apigovscan.yaml: llm: unknown key "url"');
    }
  });

  it("rejects non-string llm values", () => {
    const result = loadConfigFromText("llm:\n  baseUrl: 42\n", "apigovscan.yaml");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("config apigovscan.yaml: llm.baseUrl must be a non-empty string");
    }
  });

  it("rejects non-mapping llm", () => {
    const result = loadConfigFromText("llm: nope\n", "apigovscan.yaml");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("config apigovscan.yaml: llm must be a mapping");
    }
  });
});

describe("chatCompletion", () => {
  it("posts model + messages and returns content", async () => {
    const stub = await startLlmStub();
    try {
      const cfg: LlmConfig = { baseUrl: stub.url, model: "test-model" };
      const content = await chatCompletion(cfg, [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ]);
      expect(JSON.parse(content)).toHaveProperty("patch");
      expect(stub.requests).toHaveLength(1);
      const sent = JSON.parse(stub.requests[0]!.body) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
      };
      expect(sent.model).toBe("test-model");
      expect(sent.messages.map((m) => m.role)).toEqual(["system", "user"]);
      expect(stub.requests[0]?.authorization).toBeUndefined();
    } finally {
      await stub.close();
    }
  });

  it("sends the api key as a bearer header and never leaks it in errors", async () => {
    const stub = await startLlmStub({ status: 500, rawBody: "boom" });
    try {
      const cfg: LlmConfig = {
        baseUrl: stub.url,
        apiKey: "super-secret-key",
        model: "m",
      };
      await expect(chatCompletion(cfg, [{ role: "user", content: "x" }])).rejects.toThrow(
        "llm request failed: HTTP 500",
      );
      expect(stub.requests[0]?.authorization).toBe("Bearer super-secret-key");
    } finally {
      await stub.close();
    }
  });

  it("requires a model", async () => {
    const stub = await startLlmStub();
    try {
      await expect(
        chatCompletion({ baseUrl: stub.url }, [{ role: "user", content: "x" }]),
      ).rejects.toThrow("llm.model is not configured");
      expect(stub.requests).toHaveLength(0);
    } finally {
      await stub.close();
    }
  });

  it("rejects non-JSON and content-less responses", async () => {
    const notJson = await startLlmStub({ rawBody: "not json" });
    try {
      await expect(
        chatCompletion({ baseUrl: notJson.url, model: "m" }, [{ role: "user", content: "x" }]),
      ).rejects.toThrow("invalid llm response: expected JSON");
    } finally {
      await notJson.close();
    }
    const noContent = await startLlmStub({ response: { choices: [] } });
    try {
      await expect(
        chatCompletion({ baseUrl: noContent.url, model: "m" }, [{ role: "user", content: "x" }]),
      ).rejects.toThrow("missing choices[0].message.content");
    } finally {
      await noContent.close();
    }
  });

  it("aborts past the timeout", async () => {
    const stub = await startLlmStub({ delayMs: 500 });
    try {
      await expect(
        chatCompletion({ baseUrl: stub.url, model: "m" }, [{ role: "user", content: "x" }], {
          timeoutMs: 20,
        }),
      ).rejects.toThrow("llm request failed:");
    } finally {
      await stub.close();
    }
  });

  it("strips trailing slashes from baseUrl", async () => {
    const stub = await startLlmStub();
    try {
      await chatCompletion({ baseUrl: `${stub.url}///`, model: "m" }, [
        { role: "user", content: "x" },
      ]);
      expect(stub.requests[0]?.path).toBe("/chat/completions");
    } finally {
      await stub.close();
    }
  });
});
