import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchModelList } from '../server/models.js';
import { sendApiRequest } from '../server/requester.js';

describe('local API transport safety', () => {
  let server;
  let baseUrl;
  let responseHandler;

  beforeEach(async () => {
    responseHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    };
    server = createServer((req, res) => responseHandler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('通过本地 OpenAI 兼容接口完成非流式请求', async () => {
    responseHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'mock response' } }] }));
    };

    const result = await sendApiRequest({
      api: {
        protocol: 'openai',
        baseUrl,
        apiKey: 'test-key',
        model: 'mock-model',
        stream: false,
        useProxy: false
      },
      promptText: 'hello',
      systemInstruction: 'safe',
      proxy: { enabled: false },
      maxOutputTokens: 32
    });

    expect(result).toMatchObject({ status: 200, firstTokenMs: null, streamed: false });
    expect(result.outputChars).toBeGreaterThan(0);
  });

  it('通过本地 SSE 接口完成流式请求并记录首包', async () => {
    responseHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"delta":"first"}\n\n');
      setTimeout(() => res.end('data: [DONE]\n\n'), 5);
    };

    const result = await sendApiRequest({
      api: {
        protocol: 'openai',
        baseUrl,
        apiKey: 'test-key',
        model: 'mock-model',
        stream: true,
        useProxy: false
      },
      promptText: 'hello',
      systemInstruction: 'safe',
      proxy: { enabled: false },
      maxOutputTokens: 32
    });

    expect(result.status).toBe(200);
    expect(result.streamed).toBe(true);
    expect(result.firstTokenMs).not.toBeNull();
    expect(result.chunks).toBeGreaterThanOrEqual(1);
    expect(result.outputChars).toBeGreaterThan(0);
  });

  it('通过本地 Claude Messages 接口发送正确认证头和请求体', async () => {
    let captured;
    responseHandler = async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      captured = {
        url: req.url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }));
    };

    const result = await sendApiRequest({
      api: {
        protocol: 'claude',
        baseUrl,
        apiKey: 'claude-test-key',
        model: 'claude-mock',
        stream: false,
        useProxy: false
      },
      promptText: 'hello',
      systemInstruction: 'safe',
      proxy: { enabled: false },
      maxOutputTokens: 32
    });

    expect(result.status).toBe(200);
    expect(captured.url).toBe('/v1/messages');
    expect(captured.headers['x-api-key']).toBe('claude-test-key');
    expect(captured.headers.authorization).toBeUndefined();
    expect(captured.body.max_tokens).toBe(32);
  });

  it('通过本地 Gemini 接口完成流式请求', async () => {
    let capturedUrl;
    let capturedKey;
    responseHandler = (req, res) => {
      capturedUrl = req.url;
      capturedKey = req.headers['x-goog-api-key'];
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('data: {"candidates":[]}\n\n');
    };

    const result = await sendApiRequest({
      api: {
        protocol: 'gemini',
        baseUrl,
        apiKey: 'gemini-test-key',
        model: 'gemini-mock',
        stream: true,
        useProxy: false
      },
      promptText: 'hello',
      systemInstruction: 'safe',
      proxy: { enabled: false },
      maxOutputTokens: 32
    });

    expect(result.status).toBe(200);
    expect(result.streamed).toBe(true);
    expect(capturedUrl).toContain('/v1beta/models/gemini-mock:streamGenerateContent?alt=sse');
    expect(capturedKey).toBe('gemini-test-key');
  });

  it('本地并发发送 25 个请求时全部完成', async () => {
    responseHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    };
    const api = {
      protocol: 'openai',
      baseUrl,
      apiKey: 'test-key',
      model: 'mock-model',
      stream: false,
      useProxy: false
    };

    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        sendApiRequest({
          api,
          promptText: 'hello',
          systemInstruction: 'safe',
          proxy: { enabled: false },
          maxOutputTokens: 32
        })
      )
    );

    expect(results).toHaveLength(25);
    expect(results.every((result) => result.status === 200)).toBe(true);
  });

  it('流式响应中途断开时返回失败而不是成功结果', async () => {
    responseHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: partial\n\n');
      res.socket.destroy();
    };

    await expect(
      sendApiRequest({
        api: {
          protocol: 'openai',
          baseUrl,
          apiKey: 'test-key',
          model: 'mock-model',
          stream: true,
          useProxy: false
        },
        promptText: 'hello',
        systemInstruction: 'safe',
        proxy: { enabled: false },
        maxOutputTokens: 32
      })
    ).rejects.toBeInstanceOf(Error);
  });

  it('上游错误正文回显 API Key 时不会写入异常消息', async () => {
    const apiKey = 'test-private-pressure-key';
    responseHandler = (_req, res) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(`upstream rejected authorization: Bearer ${apiKey}`);
    };

    let error;
    try {
      await sendApiRequest({
        api: {
          protocol: 'openai',
          baseUrl,
          apiKey,
          model: 'mock-model',
          stream: false,
          useProxy: false
        },
        promptText: 'hello',
        systemInstruction: 'safe',
        proxy: { enabled: false },
        maxOutputTokens: 32
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('HTTP 500');
    expect(error.message).not.toContain(apiKey);
    expect(error.message).toContain('[REDACTED]');
  });

  it('模型列表错误正文回显 API Key 时不会返回到前端', async () => {
    const apiKey = 'test-private-model-key';
    responseHandler = (_req, res) => {
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end(`invalid key: ${apiKey}`);
    };

    let error;
    try {
      await fetchModelList({
        api: {
          protocol: 'openai',
          baseUrl,
          apiKey,
          model: 'mock-model',
          useProxy: false
        },
        proxy: { enabled: false }
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('HTTP 401');
    expect(error.message).not.toContain(apiKey);
    expect(error.message).toContain('[REDACTED]');
  });
});
