// 通用格式化工具函数。

// 毫秒 -> mm:ss
export function formatDuration(ms) {
  const seconds = Math.floor((Number(ms) || 0) / 1000);
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// 大数字紧凑显示：1234 -> 1.2k，1200000 -> 1.2m
export function compact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// 毫秒 -> 秒，避免监控面板显示过大的 ms 数值。
export function formatLatencySeconds(ms) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000;
  if (seconds === 0) return '0s';
  return `${seconds.toFixed(1)}s`;
}

// 运行状态中文文案。
export function statusText(status) {
  return (
    {
      idle: '空闲',
      running: '运行中',
      paused: '已暂停',
      stopped: '已停止',
      completed: '已完成'
    }[status] || status || '未知'
  );
}

// 分区 key -> 展示文案。
export function tierLabel(tier) {
  return (
    {
      '2-5w': '2-5w',
      '5-10w': '5-10w',
      '10-15w': '10-15w',
      '15-20w': '15-20w'
    }[tier] || tier || '—'
  );
}

// 策略 key -> 展示文案。
export function strategyLabel(strategy) {
  return strategy === 'scroll' ? '滚动模式' : '权重模式';
}

// 从错误消息中提取 HTTP 状态码。
export function extractStatusCode(error = '') {
  const match = String(error).match(/\b(400|401|403|404|408|409|422|429|500|502|503|504)\b/);
  return match?.[1] || '';
}

// 预览请求完整地址（前端本地预览用，与后端 protocols 保持一致的默认路径规则）。
export function previewApiUrl(api) {
  if (!api?.baseUrl) return '';
  const baseUrl = api.baseUrl.replace(/\/+$/, '');
  if (api.path) return `${baseUrl}${api.path.startsWith('/') ? api.path : `/${api.path}`}`;
  if (api.protocol === 'gemini') {
    const model = encodeURIComponent(api.model || '{model}');
    const action = api.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return `${baseUrl}/v1beta/models/${model}:${action}`;
  }
  if (api.protocol === 'claude') return `${baseUrl}/v1/messages`;
  return `${baseUrl}/v1/chat/completions`;
}

// 生成期望输出 token 候选阶梯（整齐整数），与后端 buildOutputTokenCandidates 保持一致。
export function buildCandidates(min, max, step) {
  const lo = Math.max(0, Math.round(Number(min) || 0));
  const hi = Math.max(lo, Math.round(Number(max) || 0));
  const st = Math.max(1, Math.round(Number(step) || 1));
  const candidates = [];
  for (let value = lo; value <= hi; value += st) {
    candidates.push(value);
  }
  if (candidates.length === 0) candidates.push(lo);
  if (candidates[candidates.length - 1] !== hi && hi > candidates[candidates.length - 1]) {
    candidates.push(hi);
  }
  return candidates;
}

// 本地脱敏显示 API Key（保留头尾），与后端一致。
export function maskKey(apiKey) {
  const key = String(apiKey || '');
  if (!key) return '';
  if (key.startsWith('sk-...')) return key; // 已是服务端脱敏形式
  if (key.length <= 8) return `${key.slice(0, 2)}****`;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
