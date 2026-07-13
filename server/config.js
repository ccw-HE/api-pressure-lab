import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '..');
export const dataDir = path.join(rootDir, 'data');
export const runsDir = path.join(dataDir, 'runs');
export const configPath = path.join(dataDir, 'config.json');
export const metricsPath = path.join(dataDir, 'metrics.json');

export const defaultConfig = {
  proxy: {
    enabled: true,
    url: 'http://127.0.0.1:7897'
  },
  load: {
    rpm: 10,
    totalRequests: 5000,
    maxConcurrent: 10,
    jitterSeconds: 5,
    retries: 0,
    stopAfterConsecutiveFailures: 10
  },
  prompt: {
    stream: true,
    systemInstruction:
      '你是一位积极、温和、谨慎的中文写作者。请只创作健康、友善、建设性、适合普通工作场景阅读的内容。遇到可能引起不适或高风险的方向时，改写为日常协作、学习成长、自然观察和社区建设。',
    prefix: '',
    suffix: '',
    // 期望输出 token（写入 Prompt 的目标值）：min/max/step，正态分布抽样。
    expectedOutput: {
      min: 1500,
      max: 3000,
      step: 500
    },
    // Prompt 策略：'weight' 权重模式（默认）或 'scroll' 滚动模式。
    strategy: 'weight',
    // 权重模式：4 个分区的百分比，合计 100。
    weights: {
      '2-5w': 10,
      '5-10w': 35,
      '10-15w': 35,
      '15-20w': 20
    },
    // 滚动模式：每轮 token 随机增量范围。
    scroll: {
      incrementMin: 3000,
      incrementMax: 5000
    }
  },
  // 请求体最大输出 token（全局统一，下发到所有请求的 max_tokens）。
  output: {
    maxOutputTokens: 20000
  },
  apis: [
    {
      id: 'newapi-openai',
      name: 'NewAPI OpenAI兼容',
      enabled: true,
      protocol: 'openai',
      baseUrl: 'https://api.example.com',
      path: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      stream: true,
      useProxy: true
    }
  ]
};

export async function ensureDataDirs() {
  await mkdir(runsDir, { recursive: true });
}

export async function loadConfig() {
  await ensureDataDirs();
  try {
    const raw = await readFile(configPath, 'utf8');
    return mergeConfig(defaultConfig, JSON.parse(raw));
  } catch {
    return structuredClone(defaultConfig);
  }
}

export async function saveConfig(config) {
  await ensureDataDirs();
  const normalized = normalizeConfig(config);
  await writeJsonFile(configPath, normalized);
  return normalized;
}

export async function writeJsonFile(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

export function normalizeConfig(config) {
  const merged = mergeConfig(defaultConfig, config ?? {});
  const apis = Array.isArray(merged.apis) ? merged.apis.slice(0, 10) : [];
  return {
    ...merged,
    load: {
      rpm: clampNumber(merged.load?.rpm, 1, 600, 10),
      totalRequests: clampNumber(merged.load?.totalRequests, 1, 100000, 5000),
      maxConcurrent: clampNumber(merged.load?.maxConcurrent, 1, 100, 10),
      jitterSeconds: clampNumber(merged.load?.jitterSeconds, 0, 30, 5),
      retries: clampNumber(merged.load?.retries, 0, 2, 0),
      stopAfterConsecutiveFailures: clampNumber(merged.load?.stopAfterConsecutiveFailures, 0, 1000, 10)
    },
    prompt: normalizePrompt(merged.prompt),
    output: {
      // 请求体最大输出 token：全局统一，范围 1024-65535，默认 20000。
      maxOutputTokens: clampNumber(merged.output?.maxOutputTokens, 1024, 65535, 20000)
    },
    apis: apis.map((api, index) => ({
      id: String(api.id || `api-${index + 1}`),
      name: String(api.name || `API ${index + 1}`),
      enabled: Boolean(api.enabled),
      protocol: ['openai', 'claude', 'gemini'].includes(api.protocol) ? api.protocol : 'openai',
      baseUrl: String(api.baseUrl || '').replace(/\/+$/, ''),
      path: String(api.path || ''),
      apiKey: String(api.apiKey || ''),
      model: String(api.model || ''),
      stream: Boolean(api.stream),
      useProxy: api.useProxy !== false
    }))
  };
}

// 规范化 prompt 配置：期望输出 token 区间、策略、权重、滚动增量。
function normalizePrompt(prompt = {}) {
  const expected = prompt.expectedOutput || {};
  const min = clampNumber(expected.min, 0, 65535, 1500);
  const max = Math.max(min, clampNumber(expected.max, 0, 65535, 3000));
  const step = clampNumber(expected.step, 1, 65535, 500);

  const strategy = prompt.strategy === 'scroll' ? 'scroll' : 'weight';

  const weights = normalizeWeights(prompt.weights);

  const scroll = prompt.scroll || {};
  const incrementMin = clampNumber(scroll.incrementMin, 0, 200000, 3000);
  const incrementMax = Math.max(incrementMin, clampNumber(scroll.incrementMax, 0, 200000, 5000));

  return {
    stream: prompt.stream !== false,
    systemInstruction: String(prompt.systemInstruction || ''),
    prefix: String(prompt.prefix || ''),
    suffix: String(prompt.suffix || ''),
    expectedOutput: { min, max, step },
    strategy,
    weights,
    scroll: { incrementMin, incrementMax }
  };
}

// 规范化权重：4 分区，非负，合计归一到 100（保持相对比例，末项吸收取整误差）。
function normalizeWeights(input = {}) {
  const keys = ['2-5w', '5-10w', '10-15w', '15-20w'];
  const raw = keys.map((key) => {
    const n = Number(input[key]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const total = raw.reduce((sum, v) => sum + v, 0);
  const result = {};
  if (total <= 0) {
    // 全为 0 时回退到默认权重。
    return { '2-5w': 10, '5-10w': 35, '10-15w': 35, '15-20w': 20 };
  }
  let acc = 0;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      result[key] = Math.max(0, 100 - acc);
    } else {
      const pct = Math.round((raw[i] / total) * 100);
      result[key] = pct;
      acc += pct;
    }
  });
  return result;
}

function mergeConfig(base, incoming) {
  return {
    ...base,
    ...incoming,
    proxy: { ...base.proxy, ...(incoming.proxy ?? {}) },
    load: { ...base.load, ...(incoming.load ?? {}) },
    prompt: { ...base.prompt, ...(incoming.prompt ?? {}) },
    output: { ...base.output, ...(incoming.output ?? {}) },
    apis: incoming.apis ?? base.apis
  };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function redactedConfig(config) {
  return {
    ...config,
    apis: config.apis.map((api) => ({
      ...api,
      apiKey: api.apiKey ? `sk-...${api.apiKey.slice(-4)}` : ''
    }))
  };
}
