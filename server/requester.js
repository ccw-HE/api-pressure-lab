import { fetch, ProxyAgent } from 'undici';
import { buildRequest } from './protocols.js';

export async function sendApiRequest({ api, promptText, systemInstruction, proxy, maxOutputTokens }) {
  const startedAt = Date.now();
  const request = buildRequest({
    api,
    promptText,
    systemInstruction,
    stream: api.stream,
    maxOutputTokens
  });
  const dispatcher = proxy?.enabled && api.useProxy ? new ProxyAgent(proxy.url) : undefined;
  const response = await fetch(request.url, {
    ...request.init,
    dispatcher,
    signal: AbortSignal.timeout(1000 * 60 * 20)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const safeText = api.apiKey ? text.split(api.apiKey).join('[REDACTED]') : text;
    throw new Error(`HTTP ${response.status}: ${safeText.slice(0, 500)}`);
  }

  if (request.stream) {
    return readStreamResponse(response, startedAt);
  }

  const payload = await response.json();
  return {
    status: response.status,
    firstTokenMs: null,
    durationMs: Date.now() - startedAt,
    outputChars: JSON.stringify(payload).length,
    streamed: false
  };
}

async function readStreamResponse(response, startedAt) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let firstTokenMs = null;
  let outputChars = 0;
  let chunks = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text.trim() && firstTokenMs === null) {
      firstTokenMs = Date.now() - startedAt;
    }
    outputChars += text.length;
    chunks += 1;
  }

  return {
    status: response.status,
    firstTokenMs,
    durationMs: Date.now() - startedAt,
    outputChars,
    chunks,
    streamed: true
  };
}
