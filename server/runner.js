import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { configPath, metricsPath, runsDir, writeJsonFile } from './config.js';
import { buildPromptById } from './prompts.js';
import { createStrategy } from './strategy.js';
import { sampleExpectedOutputTokens } from './outputTokens.js';
import { createMinuteSchedule, estimateRpm } from './scheduler.js';
import { sendApiRequest } from './requester.js';

const emptyMetrics = () => ({
  status: 'idle',
  runId: null,
  startedAt: null,
  stoppedAt: null,
  elapsedMs: 0,
  accumulatedElapsedMs: 0,
  planned: 0,
  sent: 0,
  succeeded: 0,
  failed: 0,
  inFlight: 0,
  streamCount: 0,
  nonStreamCount: 0,
  interruptedStreams: 0,
  consecutiveFailures: 0,
  stopReason: '',
  currentTier: '',
  actualRpm: 0,
  averageDurationMs: 0,
  averageFirstTokenMs: 0,
  p50Ms: 0,
  p95Ms: 0,
  p99Ms: 0,
  inputTokens: 0,
  outputTokens: 0,
  byApi: {},
  errors: {},
  timeline: []
});

export class PressureRunner {
  constructor() {
    this.config = null;
    this.metrics = emptyMetrics();
    this.listeners = new Set();
    this.minutePlan = [];
    this.sentTimes = [];
    this.durations = [];
    this.firstTokenTimes = [];
    this.timer = null;
    this.minuteTimer = null;
    this.apiCursor = 0;
    this.consecutiveFailures = 0;
    this.strategy = null;
    this.metricsSaveTimer = null;
    this.metricsSaveChain = Promise.resolve();
  }

  async loadPersistedMetrics() {
    if (!existsSync(configPath)) {
      this.metrics = emptyMetrics();
      return;
    }
    try {
      const raw = await readFile(metricsPath, 'utf8');
      const saved = JSON.parse(raw);
      this.metrics = {
        ...emptyMetrics(),
        ...saved,
        status: 'idle',
        runId: null,
        startedAt: null,
        stoppedAt: null,
        inFlight: 0,
        planned: 0,
        stopReason: ''
      };
      this.durations = Array.isArray(saved.durations) ? saved.durations.slice(-2000) : [];
      this.firstTokenTimes = Array.isArray(saved.firstTokenTimes) ? saved.firstTokenTimes.slice(-2000) : [];
      this.updateLatencyMetrics();
    } catch {
      this.metrics = emptyMetrics();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    this.pruneSentTimes();
    const runningElapsed = this.metrics.startedAt ? Date.now() - this.metrics.startedAt : 0;
    const elapsedMs = (this.metrics.accumulatedElapsedMs || 0) + runningElapsed;
    return {
      ...this.metrics,
      elapsedMs,
      actualRpm: estimateRpm(this.sentTimes)
    };
  }

  start(config) {
    if (['running', 'paused'].includes(this.metrics.status)) {
      throw new Error('已有任务正在运行');
    }
    const enabledApis = config.apis.filter((api) => api.enabled && api.baseUrl && api.apiKey && api.model);
    if (!enabledApis.length) {
      throw new Error('至少需要一个已启用且填写完整的 API');
    }

    this.clearTimers();
    this.config = { ...config, apis: enabledApis };
    this.metrics = emptyMetrics();
    this.metrics.status = 'running';
    this.metrics.runId = randomUUID();
    this.metrics.startedAt = Date.now();
    this.metrics.planned = config.load.totalRequests;
    this.minutePlan = [];
    this.sentTimes = [];
    this.durations = [];
    this.firstTokenTimes = [];
    this.apiCursor = 0;
    this.consecutiveFailures = 0;
    // 按配置创建 Prompt 调度策略（权重模式 / 滚动模式）。
    this.strategy = createStrategy(this.config.prompt);
    this.planNextMinute();
    this.tick();
    this.timer = setInterval(() => this.tick(), 250);
    this.minuteTimer = setInterval(() => this.planNextMinute(), 60000);
    this.emit();
    return this.snapshot();
  }

  pause() {
    if (this.metrics.status !== 'running') return this.snapshot();
    this.finalizeElapsed();
    this.metrics.status = 'paused';
    this.minutePlan = [];
    this.clearTimers();
    this.emit();
    return this.snapshot();
  }

  resume() {
    if (this.metrics.status !== 'paused') return this.snapshot();
    this.clearTimers();
    this.metrics.status = 'running';
    this.metrics.startedAt = Date.now();
    this.minutePlan = [];
    this.planNextMinute();
    this.timer = setInterval(() => this.tick(), 250);
    this.minuteTimer = setInterval(() => this.planNextMinute(), 60000);
    this.emit();
    return this.snapshot();
  }

  stop() {
    if (['idle', 'stopped', 'completed'].includes(this.metrics.status)) return this.snapshot();
    this.finalizeElapsed();
    this.metrics.status = 'stopped';
    this.clearTimers();
    this.emit();
    this.saveMetricsSoon();
    return this.snapshot();
  }

  clear() {
    this.stop();
    if (this.metrics.inFlight > 0) {
      throw new Error('仍有请求进行中，请等待请求结束后再清空运行状态');
    }
    this.metrics.status = 'idle';
    this.metrics.runId = null;
    this.metrics.planned = 0;
    this.metrics.inFlight = 0;
    this.metrics.stopReason = '';
    this.metrics.timeline = [];
    this.emit();
    this.saveMetricsSoon();
    return this.snapshot();
  }

  resetStats() {
    this.stop();
    if (this.metrics.inFlight > 0) {
      throw new Error('仍有请求进行中，请等待请求结束后再重置统计');
    }
    this.metrics = emptyMetrics();
    this.durations = [];
    this.firstTokenTimes = [];
    this.sentTimes = [];
    this.consecutiveFailures = 0;
    this.emit();
    this.saveMetricsSoon();
    return this.snapshot();
  }

  planNextMinute() {
    if (!this.config || this.metrics.status === 'paused') return;
    const now = Date.now();
    const newPlan = createMinuteSchedule({
      rpm: this.config.load.rpm,
      jitterSeconds: this.config.load.jitterSeconds,
      now
    });
    this.minutePlan.push(...newPlan);
    this.minutePlan.sort((a, b) => a - b);
  }

  tick() {
    if (!this.config || this.metrics.status !== 'running') return;
    const now = Date.now();
    const maxConcurrent = this.config.load.maxConcurrent;

    while (
      this.minutePlan.length &&
      this.minutePlan[0] <= now &&
      this.metrics.sent < this.metrics.planned &&
      this.metrics.inFlight < maxConcurrent
    ) {
      this.minutePlan.shift();
      this.dispatchRequest().catch((error) => {
        this.recordRunnerError(error);
        this.emit();
      });
    }

    if (this.metrics.sent >= this.metrics.planned && this.metrics.inFlight === 0) {
      this.finalizeElapsed();
      this.metrics.status = 'completed';
      this.clearTimers();
      this.emit();
      this.saveMetricsSoon();
    }
  }

  async dispatchRequest() {
    const api = this.nextApi();
    const sentAt = Date.now();
    this.metrics.sent += 1;
    this.metrics.inFlight += 1;
    this.sentTimes.push(sentAt);
    this.ensureApiMetric(api);
    this.metrics.byApi[api.id].sent += 1;
    if (api.stream) this.metrics.streamCount += 1;
    else this.metrics.nonStreamCount += 1;

    let promptId = '';
    let inputTokens = 0;

    try {
      // 双策略调度：由 this.strategy 选出 Prompt 与命中分区。
      const picked = this.strategy.next();
      // 期望输出 token（写入 Prompt 的目标值，正态分布抽样）。
      const expectedOutputTokens = sampleExpectedOutputTokens(this.config.prompt.expectedOutput);
      const prompt = buildPromptById(picked.prompt.id, {
        outputTokens: expectedOutputTokens,
        prefix: this.config.prompt.prefix,
        suffix: this.config.prompt.suffix
      });
      promptId = prompt.meta.id;
      this.metrics.currentTier = picked.tier;
      inputTokens = estimateTokens(prompt.text);
      this.metrics.inputTokens += inputTokens;
      this.recordTimeline({ type: 'sent', apiId: api.id, at: sentAt });
      this.emit();

      const result = await this.withRetries(() =>
        sendApiRequest({
          api,
          promptText: prompt.text,
          systemInstruction: this.config.prompt.systemInstruction,
          proxy: this.config.proxy,
          // 请求体最大输出 token：全局统一下发。
          maxOutputTokens: this.config.output.maxOutputTokens
        })
      );
      this.metrics.succeeded += 1;
      this.consecutiveFailures = 0;
      this.metrics.consecutiveFailures = 0;
      this.metrics.byApi[api.id].succeeded += 1;
      this.metrics.outputTokens += estimateTokensByChars(result.outputChars);
      this.durations.push(result.durationMs);
      if (result.firstTokenMs !== null) this.firstTokenTimes.push(result.firstTokenMs);
      this.updateLatencyMetrics();
      this.saveMetricsSoon();
      await this.safeWriteLog({ apiId: api.id, promptId, ok: true, inputTokens, ...result });
      this.recordTimeline({ type: 'success', apiId: api.id, at: Date.now(), durationMs: result.durationMs });
    } catch (error) {
      const message = error?.message || String(error);
      this.metrics.failed += 1;
      this.consecutiveFailures += 1;
      this.metrics.consecutiveFailures = this.consecutiveFailures;
      this.metrics.byApi[api.id].failed += 1;
      this.metrics.errors[message] = (this.metrics.errors[message] || 0) + 1;
      if (api.stream) this.metrics.interruptedStreams += 1;
      await this.safeWriteLog({ apiId: api.id, promptId, ok: false, inputTokens, error: message });
      this.recordTimeline({ type: 'error', apiId: api.id, at: Date.now(), error: message.slice(0, 180) });
      this.stopIfFailureLimitReached();
      this.saveMetricsSoon();
    } finally {
      this.metrics.inFlight -= 1;
      this.emit();
    }
  }

  stopIfFailureLimitReached() {
    const limit = this.config?.load?.stopAfterConsecutiveFailures || 0;
    if (!limit || this.consecutiveFailures < limit || this.metrics.status !== 'running') return;
    this.metrics.status = 'stopped';
    this.finalizeElapsed();
    this.metrics.stopReason = `连续失败 ${this.consecutiveFailures} 次，已自动停止`;
    this.minutePlan = [];
    this.clearTimers();
    this.saveMetricsSoon();
  }

  nextApi() {
    const api = this.config.apis[this.apiCursor % this.config.apis.length];
    this.apiCursor += 1;
    return api;
  }

  async withRetries(fn) {
    const retries = this.config.load.retries;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  ensureApiMetric(api) {
    if (!this.metrics.byApi[api.id]) {
      this.metrics.byApi[api.id] = {
        name: api.name,
        protocol: api.protocol,
        sent: 0,
        succeeded: 0,
        failed: 0
      };
    }
  }

  updateLatencyMetrics(now = Date.now()) {
    this.durations = this.durations.slice(-2000);
    this.firstTokenTimes = this.firstTokenTimes.slice(-2000);
    this.pruneSentTimes(now);
    this.metrics.averageDurationMs = average(this.durations);
    this.metrics.averageFirstTokenMs = average(this.firstTokenTimes);
    this.metrics.p50Ms = percentile(this.durations, 50);
    this.metrics.p95Ms = percentile(this.durations, 95);
    this.metrics.p99Ms = percentile(this.durations, 99);
  }

  pruneSentTimes(now = Date.now()) {
    const start = now - 60000;
    this.sentTimes = this.sentTimes.filter((time) => time >= start && time <= now);
  }

  recordTimeline(event) {
    this.metrics.timeline.push(event);
    if (this.metrics.timeline.length > 240) {
      this.metrics.timeline = this.metrics.timeline.slice(-240);
    }
  }

  async writeLog(entry) {
    const file = path.join(runsDir, `${this.metrics.runId}.jsonl`);
    const payload = {
      runId: this.metrics.runId,
      time: new Date().toISOString(),
      ...entry
    };
    await appendFile(file, `${JSON.stringify(payload)}\n`, 'utf8');
  }

  async safeWriteLog(entry) {
    try {
      await this.writeLog(entry);
    } catch (error) {
      this.recordRunnerError(error, '日志写入失败');
    }
  }

  recordRunnerError(error, prefix = '运行器错误') {
    const message = `${prefix}: ${error?.message || String(error)}`;
    this.metrics.failed += 1;
    this.metrics.errors[message] = (this.metrics.errors[message] || 0) + 1;
    this.recordTimeline({ type: 'error', apiId: 'runner', at: Date.now(), error: message.slice(0, 180) });
  }

  finalizeElapsed() {
    if (!this.metrics.startedAt) return;
    this.metrics.accumulatedElapsedMs = (this.metrics.accumulatedElapsedMs || 0) + (Date.now() - this.metrics.startedAt);
    this.metrics.startedAt = null;
    this.metrics.stoppedAt = Date.now();
  }

  saveMetricsSoon() {
    const snapshot = {
      ...this.snapshot(),
      durations: this.durations.slice(-2000),
      firstTokenTimes: this.firstTokenTimes.slice(-2000),
      status: 'idle',
      runId: null,
      startedAt: null,
      stoppedAt: null,
      inFlight: 0,
      planned: 0
    };
    if (this.metricsSaveTimer) clearTimeout(this.metricsSaveTimer);
    this.metricsSaveTimer = setTimeout(() => {
      this.metricsSaveTimer = null;
      this.metricsSaveChain = this.metricsSaveChain
        .catch(() => {})
        .then(() => writeJsonFile(metricsPath, snapshot));
    }, 500);
    this.metricsSaveTimer.unref?.();
  }

  clearTimers() {
    if (this.timer) clearInterval(this.timer);
    if (this.minuteTimer) clearInterval(this.minuteTimer);
    this.timer = null;
    this.minuteTimer = null;
  }

  emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
}

function estimateTokens(text) {
  return Math.round(String(text).length / 1.65);
}

function estimateTokensByChars(chars) {
  return Math.round((Number(chars) || 0) / 1.65);
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}
