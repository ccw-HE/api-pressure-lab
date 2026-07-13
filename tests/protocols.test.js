import { describe, expect, it } from "vitest";
import {
  buildModelListRequest,
  buildRequest,
  buildRequestPreview,
  extractModelIds,
  previewCompletionUrl,
  redactApiKey,
} from "../server/protocols.js";

const baseApi = {
  baseUrl: "https://api.example.com",
  apiKey: "test-key",
  model: "model-a",
  outputTokens: 6000,
  stream: true,
};

describe("protocol builders", () => {
  it("builds OpenAI chat completion request", () => {
    const request = buildRequest({
      api: { ...baseApi, protocol: "openai" },
      promptText: "你好",
      systemInstruction: "安全",
    });
    const body = JSON.parse(request.init.body);
    expect(request.url).toBe("https://api.example.com/v1/chat/completions");
    expect(request.init.headers.authorization).toBe("Bearer test-key");
    expect(body.messages).toHaveLength(2);
    expect(body.stream).toBe(true);
  });

  it("builds Claude messages request", () => {
    const request = buildRequest({
      api: { ...baseApi, protocol: "claude" },
      promptText: "你好",
      systemInstruction: "安全",
    });
    const body = JSON.parse(request.init.body);
    expect(request.url).toBe("https://api.example.com/v1/messages");
    expect(request.init.headers["x-api-key"]).toBe("test-key");
    expect(body.max_tokens).toBe(6000);
  });

  it("builds Gemini stream request", () => {
    const request = buildRequest({
      api: { ...baseApi, protocol: "gemini" },
      promptText: "你好",
      systemInstruction: "安全",
    });
    expect(request.url).toBe(
      "https://api.example.com/v1beta/models/model-a:streamGenerateContent?alt=sse"
    );
    expect(request.init.headers["x-goog-api-key"]).toBe("test-key");
  });

  it("previews default completion paths", () => {
    expect(previewCompletionUrl({ ...baseApi, protocol: "openai" })).toBe(
      "https://api.example.com/v1/chat/completions"
    );
    expect(previewCompletionUrl({ ...baseApi, protocol: "claude" })).toBe(
      "https://api.example.com/v1/messages"
    );
    expect(previewCompletionUrl({ ...baseApi, protocol: "gemini" })).toBe(
      "https://api.example.com/v1beta/models/model-a:streamGenerateContent?alt=sse"
    );
  });

  it("builds model list request and extracts model ids", () => {
    const request = buildModelListRequest({ ...baseApi, protocol: "openai" });
    expect(request.url).toBe("https://api.example.com/v1/models");
    expect(
      extractModelIds("openai", { data: [{ id: "gpt-a" }, { id: "gpt-b" }] })
    ).toEqual(["gpt-a", "gpt-b"]);
    expect(
      extractModelIds("gemini", { models: [{ name: "models/gemini-a" }] })
    ).toEqual(["gemini-a"]);
  });

  it("全局 maxOutputTokens 覆盖请求体 max_tokens", () => {
    const request = buildRequest({
      api: { ...baseApi, protocol: "openai" },
      promptText: "你好",
      systemInstruction: "安全",
      maxOutputTokens: 20000,
    });
    const body = JSON.parse(request.init.body);
    expect(body.max_tokens).toBe(20000);
  });
});

describe("request preview builders", () => {
  const previewApi = {
    baseUrl: "https://api.example.com",
    apiKey: "test-key-1234567890abcdef",
    model: "gpt-4o",
    stream: true,
  };
  const promptMeta = { estimatedTokens: 30000 };

  it("redactApiKey 保留头尾且不泄露完整 key", () => {
    expect(redactApiKey("test-key-1234567890abcdef")).toBe("test****cdef");
    expect(redactApiKey("short")).toBe("sh****");
    expect(redactApiKey("")).toBe("");
  });

  it("OpenAI 预览使用 authorization Bearer 且脱敏", () => {
    const preview = buildRequestPreview({
      api: { ...previewApi, protocol: "openai" },
      promptMeta,
      maxOutputTokens: 20000,
      expectedOutputTokens: 2500,
    });
    expect(preview.protocol).toBe("openai");
    expect(preview.headers.authorization).toContain("Bearer");
    expect(JSON.stringify(preview)).not.toContain("test-key-1234567890abcdef");
    expect(preview.body.max_tokens).toBe(20000);
    expect(preview.params.expectedOutputTokens).toBe(2500);
  });

  it("Claude 预览使用 x-api-key，无 authorization", () => {
    const preview = buildRequestPreview({
      api: { ...previewApi, protocol: "claude" },
      promptMeta,
      maxOutputTokens: 2000,
      expectedOutputTokens: 2500,
    });
    expect(preview.headers["x-api-key"]).toBeDefined();
    expect(preview.headers.authorization).toBeUndefined();
    expect(JSON.stringify(preview)).not.toContain("test-key-1234567890abcdef");
  });

  it("Gemini 预览使用 x-goog-api-key 且 URL 随协议变化", () => {
    const preview = buildRequestPreview({
      api: { ...previewApi, protocol: "gemini", model: "gemini-pro" },
      promptMeta,
      maxOutputTokens: 20000,
      expectedOutputTokens: 2500,
    });
    expect(preview.headers["x-goog-api-key"]).toBeDefined();
    // Gemini 流式 URL 为 streamGenerateContent（大写 G），非流式为 generateContent。
    expect(preview.url).toMatch(/GenerateContent/);
    expect(JSON.stringify(preview)).not.toContain("test-key-1234567890abcdef");
  });
});
