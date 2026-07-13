import { fetch, ProxyAgent } from 'undici';
import { buildModelListRequest, extractModelIds } from './protocols.js';

export async function fetchModelList({ api, proxy }) {
  if (!api?.baseUrl) throw new Error('请先填写 Base URL');
  if (!api?.apiKey) throw new Error('请先填写 API Key');

  const request = buildModelListRequest(api);
  const dispatcher = proxy?.enabled && api.useProxy ? new ProxyAgent(proxy.url) : undefined;
  const response = await fetch(request.url, {
    ...request.init,
    dispatcher,
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const safeText = api.apiKey ? text.split(api.apiKey).join('[REDACTED]') : text;
    throw new Error(`模型列表拉取失败 HTTP ${response.status}: ${safeText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const models = [...new Set(extractModelIds(request.protocol, payload))].sort();
  return {
    url: request.url,
    models
  };
}
