import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  loadConfig,
  normalizeConfig,
  saveConfig,
  redactedConfig,
  runsDir,
  rootDir,
  ensureDataDirs
} from './config.js';
import { checkCustomPromptPieces, validatePromptText } from './safety.js';
import { buildPromptById, getPromptCatalog, getPromptQualityReport } from './prompts.js';
import { buildRequestPreview } from './protocols.js';
import { sampleExpectedOutputTokens } from './outputTokens.js';
import { PressureRunner } from './runner.js';
import { fetchModelList } from './models.js';
import { clearRunLogFiles, readRunSummaries } from './runLogs.js';

const app = express();
const runner = new PressureRunner();
const port = Number(process.env.PORT || 4217);
const host = process.env.HOST || '127.0.0.1';

process.on('unhandledRejection', (error) => {
  console.error('Fatal unhandled rejection:', error);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  console.error('Fatal uncaught exception:', error);
  process.exit(1);
});

await ensureDataDirs();
await runner.loadPersistedMetrics();

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'API Pressure Lab' });
});

app.get('/api/config', async (_req, res, next) => {
  try {
    const config = await loadConfig();
    res.json(redactedConfig(config));
  } catch (error) {
    next(error);
  }
});

app.put('/api/config', async (req, res, next) => {
  try {
    const safety = checkCustomPromptPieces(req.body);
    if (!safety.safe) {
      res.status(400).json({ error: `自定义Prompt安全检查未通过：${safety.hits.join(', ')}` });
      return;
    }
    const current = await loadConfig();
    const config = await saveConfig(mergePreservedSecrets(current, req.body));
    res.json(redactedConfig(config));
  } catch (error) {
    next(error);
  }
});

app.post('/api/safety/check', (req, res) => {
  res.json(validatePromptText(String(req.body?.text || '')));
});

app.post('/api/models', async (req, res, next) => {
  try {
    const current = await loadConfig();
    const api = mergeApiSecret(current, req.body?.api || {});
    const result = await fetchModelList({ api, proxy: req.body?.proxy || current.proxy });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/prompts', (_req, res) => {
  res.json(getPromptCatalog());
});

app.get('/api/prompts/quality', (_req, res) => {
  res.json(getPromptQualityReport());
});

app.get('/api/prompts/:id/preview', async (req, res, next) => {
  try {
    const catalog = getPromptCatalog();
    const meta = catalog.find((item) => item.id === req.params.id) || catalog[0];
    const full = req.query.full === 'true' || req.query.full === '1';

    // 协议与 API 信息：优先按 apiId 从配置取（含真实 key，预览时脱敏），否则用 query。
    const config = await loadConfig();
    const apiFromConfig = req.query.apiId
      ? config.apis.find((item) => item.id === req.query.apiId)
      : null;
    const previewApi = apiFromConfig || {
      protocol: ['openai', 'claude', 'gemini'].includes(req.query.protocol) ? req.query.protocol : 'openai',
      baseUrl: String(req.query.baseUrl || config.apis[0]?.baseUrl || 'https://api.example.com'),
      model: String(req.query.model || config.apis[0]?.model || '{model}'),
      apiKey: apiFromConfig?.apiKey || '',
      stream: config.prompt.stream !== false
    };

    const maxOutputTokens = config.output.maxOutputTokens;
    const expectedOutputTokens = sampleExpectedOutputTokens(config.prompt.expectedOutput);
    const requestPreview = buildRequestPreview({
      api: previewApi,
      promptMeta: meta,
      maxOutputTokens,
      expectedOutputTokens
    });

    const response = {
      meta,
      requestPreview,
      summary: meta.summary,
      structure: meta.structure,
      safetyStatus: meta.safetyStatus,
      expectedOutputTokens,
      maxOutputTokens
    };

    // 默认折叠正文；full=true 时才生成并返回完整正文。
    if (full) {
      const { text } = buildPromptById(meta.id, {
        outputTokens: expectedOutputTokens,
        prefix: config.prompt.prefix,
        suffix: config.prompt.suffix
      });
      response.bodyText = text;
      response.bodySamples = sampleBodyText(text);
      response.chars = text.length;
      response.safety = validatePromptText(text);
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

function sampleBodyText(text) {
  const size = 1200;
  const middle = Math.max(0, Math.floor(text.length / 2) - Math.floor(size / 2));
  return {
    start: text.slice(0, size),
    middle: text.slice(middle, middle + size),
    end: text.slice(Math.max(0, text.length - size))
  };
}

app.get('/api/run', (_req, res) => {
  res.json(runner.snapshot());
});

app.post('/api/run/start', async (req, res, next) => {
  try {
    const current = await loadConfig();
    const requested = req.body?.config
      ? normalizeConfig(mergePreservedSecrets(current, req.body.config))
      : current;
    res.json(runner.start(requested));
  } catch (error) {
    next(error);
  }
});

app.post('/api/run/pause', (_req, res) => {
  res.json(runner.pause());
});

app.post('/api/run/resume', (_req, res) => {
  res.json(runner.resume());
});

app.post('/api/run/stop', (_req, res) => {
  res.json(runner.stop());
});

app.post('/api/run/clear', (_req, res) => {
  res.json(runner.clear());
});

app.post('/api/run/reset-stats', (_req, res) => {
  res.json(runner.resetStats());
});

app.get('/api/events', (req, res) => {
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.flushHeaders?.();
  let closed = false;
  const send = (payload) => {
    if (closed || res.destroyed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const unsubscribe = runner.subscribe(send);
  const heartbeat = setInterval(() => {
    if (!closed && !res.destroyed && !res.writableEnded) res.write(': heartbeat\n\n');
  }, 15000);
  heartbeat.unref?.();
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.once('close', cleanup);
  res.once('close', cleanup);
  res.once('error', cleanup);
});

app.get('/api/runs', async (_req, res, next) => {
  try {
    res.json(await readRunSummaries(runsDir));
  } catch (error) {
    next(error);
  }
});

app.post('/api/runs/clear', async (_req, res, next) => {
  try {
    const snapshot = runner.snapshot();
    if (['running', 'paused'].includes(snapshot.status) || snapshot.inFlight > 0) {
      res.status(409).json({ error: '请先停止任务并等待请求结束后再清除日志' });
      return;
    }

    const result = await clearRunLogFiles(runsDir);
    const metrics = runner.resetStats();
    res.json({ ...result, metrics, runs: [] });
  } catch (error) {
    next(error);
  }
});

const distDir = path.join(rootDir, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

function mergePreservedSecrets(current, incoming) {
  const currentById = new Map(current.apis.map((api) => [api.id, api]));
  return {
    ...incoming,
    apis: (incoming.apis || []).map((api) => {
      const old = currentById.get(api.id);
      if (old?.apiKey && (!api.apiKey || api.apiKey.startsWith('sk-...'))) {
        return { ...api, apiKey: old.apiKey };
      }
      return api;
    })
  };
}

function mergeApiSecret(current, api) {
  const old = current.apis.find((item) => item.id === api.id);
  if (old?.apiKey && (!api.apiKey || api.apiKey.startsWith('sk-...'))) {
    return { ...api, apiKey: old.apiKey };
  }
  return api;
}

app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error?.message || String(error) });
});

createServer(app).listen(port, host, () => {
  console.log(`API Pressure Lab server listening at http://${host}:${port}`);
});
