import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../server/config.js';
import { PressureRunner } from '../server/runner.js';

function runnableConfig() {
  const config = structuredClone(defaultConfig);
  config.apis[0] = {
    ...config.apis[0],
    enabled: true,
    baseUrl: 'https://api.example.com',
    apiKey: 'test-key',
    model: 'test-model'
  };
  config.load.totalRequests = 1;
  config.load.rpm = 1;
  return config;
}

describe('PressureRunner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('开始新一轮时重置上一轮计数，避免旧 sent 超过新总数导致立即完成', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const runner = new PressureRunner();
    runner.metrics = {
      ...runner.metrics,
      status: 'completed',
      planned: 10,
      sent: 10,
      succeeded: 9,
      failed: 1,
      streamCount: 4,
      nonStreamCount: 6,
      interruptedStreams: 1,
      inputTokens: 12345,
      outputTokens: 6789,
      byApi: {
        'old-api': {
          name: 'Old API',
          protocol: 'openai',
          sent: 10,
          succeeded: 9,
          failed: 1
        }
      },
      errors: { 'HTTP 500': 1 },
      timeline: [{ type: 'error', apiId: 'old-api', at: 1000, error: 'HTTP 500' }],
      accumulatedElapsedMs: 3000
    };

    const snapshot = runner.start(runnableConfig());

    try {
      expect(snapshot.status).toBe('running');
      expect(snapshot.planned).toBe(1);
      expect(snapshot.sent).toBe(0);
      expect(snapshot.succeeded).toBe(0);
      expect(snapshot.failed).toBe(0);
      expect(snapshot.inputTokens).toBe(0);
      expect(snapshot.outputTokens).toBe(0);
      expect(snapshot.byApi).toEqual({});
      expect(snapshot.errors).toEqual({});
      expect(snapshot.timeline).toEqual([]);
      expect(snapshot.accumulatedElapsedMs).toBe(0);
    } finally {
      runner.stop();
      runner.clearTimers();
    }
  });

  it('暂停时冻结运行时间并丢弃未发送排程，继续后重新规划', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const runner = new PressureRunner();

    runner.start(runnableConfig());
    runner.minutePlan = [Date.now() - 1, Date.now() + 1000];
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));

    const paused = runner.pause();

    try {
      expect(paused.elapsedMs).toBe(1000);
      expect(runner.minutePlan).toEqual([]);

      vi.advanceTimersByTime(5000);
      expect(runner.snapshot().elapsedMs).toBe(1000);

      const resumed = runner.resume();
      expect(resumed.status).toBe('running');
      expect(resumed.elapsedMs).toBe(1000);
      expect(runner.minutePlan.every((slot) => slot >= Date.now())).toBe(true);
    } finally {
      runner.stop();
      runner.clearTimers();
      vi.useRealTimers();
    }
  });

  it('实时指标只保留固定延迟样本和一分钟 RPM 时间窗口', () => {
    const runner = new PressureRunner();
    const now = Date.now();
    runner.durations = Array.from({ length: 2500 }, (_, index) => index + 1);
    runner.firstTokenTimes = Array.from({ length: 2500 }, (_, index) => index + 1);
    runner.sentTimes = [now - 61000, now - 59000, now - 1000];

    runner.updateLatencyMetrics(now);

    expect(runner.durations).toHaveLength(2000);
    expect(runner.firstTokenTimes).toHaveLength(2000);
    expect(runner.sentTimes).toEqual([now - 59000, now - 1000]);
  });

  it('单个失效的实时连接不会中断其他监听器，并会被自动移除', () => {
    const runner = new PressureRunner();
    const healthyListener = vi.fn();
    const brokenListener = vi.fn(() => {
      throw new Error('connection closed');
    });

    runner.listeners.add(brokenListener);
    runner.listeners.add(healthyListener);

    expect(() => runner.emit()).not.toThrow();
    expect(healthyListener).toHaveBeenCalledTimes(1);
    expect(runner.listeners.has(brokenListener)).toBe(false);
    expect(runner.listeners.has(healthyListener)).toBe(true);
  });

  it('请求准备阶段失败后释放并发计数并记录一次失败', async () => {
    const runner = new PressureRunner();
    runner.config = runnableConfig();
    runner.metrics = {
      ...runner.metrics,
      status: 'running',
      runId: 'test-run',
      planned: 1
    };
    runner.strategy = {
      next() {
        throw new Error('prompt preparation failed');
      }
    };
    vi.spyOn(runner, 'safeWriteLog').mockResolvedValue();

    await expect(runner.dispatchRequest()).resolves.toBeUndefined();

    expect(runner.metrics.sent).toBe(1);
    expect(runner.metrics.inFlight).toBe(0);
    expect(runner.metrics.failed).toBe(1);
    expect(runner.metrics.byApi['newapi-openai'].failed).toBe(1);
    expect(runner.metrics.errors).toMatchObject({
      'prompt preparation failed': 1
    });
  });

  it('仍有请求进行中时拒绝清空运行状态', () => {
    const runner = new PressureRunner();
    runner.metrics = {
      ...runner.metrics,
      status: 'running',
      inFlight: 1,
      sent: 1
    };

    expect(() => runner.clear()).toThrow('仍有请求进行中');
    expect(runner.metrics.status).toBe('stopped');
    expect(runner.metrics.inFlight).toBe(1);
    expect(runner.metrics.sent).toBe(1);
  });

  it('仍有请求进行中时拒绝重置统计', () => {
    const runner = new PressureRunner();
    runner.metrics = {
      ...runner.metrics,
      status: 'running',
      inFlight: 1,
      sent: 1
    };

    expect(() => runner.resetStats()).toThrow('仍有请求进行中');
    expect(runner.metrics.status).toBe('stopped');
    expect(runner.metrics.inFlight).toBe(1);
    expect(runner.metrics.sent).toBe(1);
  });

  it('按配置重试失败请求并在最后一次成功时返回结果', async () => {
    const runner = new PressureRunner();
    runner.config = runnableConfig();
    runner.config.load.retries = 2;
    let attempts = 0;

    const result = await runner.withRetries(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('temporary failure');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('达到连续失败阈值后停止继续调度', () => {
    const runner = new PressureRunner();
    runner.config = runnableConfig();
    runner.config.load.stopAfterConsecutiveFailures = 2;
    runner.metrics = {
      ...runner.metrics,
      status: 'running',
      startedAt: Date.now(),
      inFlight: 1
    };
    runner.consecutiveFailures = 2;

    runner.stopIfFailureLimitReached();

    expect(runner.metrics.status).toBe('stopped');
    expect(runner.metrics.stopReason).toContain('连续失败 2 次');
    expect(runner.timer).toBeNull();
    expect(runner.minuteTimer).toBeNull();
  });

  it('达到最大并发时保留待发送排程', () => {
    const runner = new PressureRunner();
    runner.config = runnableConfig();
    runner.config.load.maxConcurrent = 2;
    runner.metrics = {
      ...runner.metrics,
      status: 'running',
      planned: 10,
      sent: 2,
      inFlight: 2
    };
    runner.minutePlan = [Date.now() - 2, Date.now() - 1];

    runner.tick();

    expect(runner.minutePlan).toHaveLength(2);
    expect(runner.metrics.sent).toBe(2);
    expect(runner.metrics.inFlight).toBe(2);
  });
});
