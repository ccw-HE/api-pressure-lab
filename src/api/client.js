// API 客户端：封装所有后端接口调用。
const JSON_HEADERS = { 'content-type': 'application/json' };

async function parseJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `请求失败：HTTP ${res.status}`);
  }
  return body;
}

export async function fetchConfig() {
  return parseJson(await fetch('/api/config'));
}

export async function saveConfigToServer(config) {
  return parseJson(
    await fetch('/api/config', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(config)
    })
  );
}

export async function fetchPrompts() {
  return parseJson(await fetch('/api/prompts'));
}

export async function fetchPromptQuality() {
  return parseJson(await fetch('/api/prompts/quality'));
}

export async function fetchPromptPreview(id, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return parseJson(await fetch(`/api/prompts/${id}/preview${qs ? `?${qs}` : ''}`));
}

export async function fetchRunSnapshot() {
  return parseJson(await fetch('/api/run'));
}

export async function fetchRuns() {
  return parseJson(await fetch('/api/runs'));
}

export async function clearRunLogs() {
  return parseJson(
    await fetch('/api/runs/clear', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({})
    })
  );
}

export async function pullModels(api, proxy) {
  return parseJson(
    await fetch('/api/models', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ api, proxy })
    })
  );
}

export async function runControl(action, payload = {}) {
  return parseJson(
    await fetch(`/api/run/${action}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    })
  );
}

// 订阅实时指标 SSE 流。返回取消订阅函数。
export function openMetricsStream(onMessage, onStatus = () => {}) {
  const events = new EventSource('/api/events');
  events.onopen = () => onStatus(true);
  events.onerror = () => onStatus(false);
  events.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // 忽略无法解析的事件
    }
  };
  return () => {
    onStatus(false);
    events.close();
  };
}
