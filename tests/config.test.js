import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../server/config.js';

describe('config normalization', () => {
  it('keeps consecutive failure stop threshold configurable', () => {
    const config = normalizeConfig({
      load: {
        stopAfterConsecutiveFailures: 25
      },
      apis: []
    });
    expect(config.load.stopAfterConsecutiveFailures).toBe(25);
  });

  it('allows zero to disable consecutive failure auto stop', () => {
    const config = normalizeConfig({
      load: {
        stopAfterConsecutiveFailures: 0
      },
      apis: []
    });
    expect(config.load.stopAfterConsecutiveFailures).toBe(0);
  });

  it('请求体最大输出 token 全局默认 20000，范围 1024-65535', () => {
    expect(normalizeConfig({ apis: [] }).output.maxOutputTokens).toBe(20000);
    expect(normalizeConfig({ output: { maxOutputTokens: 100 }, apis: [] }).output.maxOutputTokens).toBe(1024);
    expect(normalizeConfig({ output: { maxOutputTokens: 999999 }, apis: [] }).output.maxOutputTokens).toBe(65535);
    expect(normalizeConfig({ output: { maxOutputTokens: 32000 }, apis: [] }).output.maxOutputTokens).toBe(32000);
  });

  it('期望输出 token 默认区间 1500/3000/500，且 max 不小于 min', () => {
    const def = normalizeConfig({ apis: [] }).prompt.expectedOutput;
    expect(def).toEqual({ min: 1500, max: 3000, step: 500 });
    const swapped = normalizeConfig({
      prompt: { expectedOutput: { min: 4000, max: 2000, step: 500 } },
      apis: []
    }).prompt.expectedOutput;
    expect(swapped.max).toBeGreaterThanOrEqual(swapped.min);
  });

  it('期望输出 token 允许用户把最小值和最大值都设为 0', () => {
    const expected = normalizeConfig({
      prompt: { expectedOutput: { min: 0, max: 0, step: 500 } },
      apis: []
    }).prompt.expectedOutput;

    expect(expected).toEqual({ min: 0, max: 0, step: 500 });
  });

  it('Prompt 策略默认 weight，可切换 scroll', () => {
    expect(normalizeConfig({ apis: [] }).prompt.strategy).toBe('weight');
    expect(normalizeConfig({ prompt: { strategy: 'scroll' }, apis: [] }).prompt.strategy).toBe('scroll');
    expect(normalizeConfig({ prompt: { strategy: 'unknown' }, apis: [] }).prompt.strategy).toBe('weight');
  });

  it('权重默认 10/35/35/20 且合计 100', () => {
    const weights = normalizeConfig({ apis: [] }).prompt.weights;
    expect(weights).toEqual({ '2-5w': 10, '5-10w': 35, '10-15w': 35, '15-20w': 20 });
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('权重归一化后合计始终为 100，支持单项 100% 其余 0%', () => {
    const weights = normalizeConfig({
      prompt: { weights: { '2-5w': 100, '5-10w': 0, '10-15w': 0, '15-20w': 0 } },
      apis: []
    }).prompt.weights;
    expect(weights['2-5w']).toBe(100);
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('滚动增量默认 3000-5000，且 max 不小于 min', () => {
    const scroll = normalizeConfig({ apis: [] }).prompt.scroll;
    expect(scroll).toEqual({ incrementMin: 3000, incrementMax: 5000 });
  });

  it('滚动增量允许 0，并保持 max 不小于 min', () => {
    const zeroScroll = normalizeConfig({
      prompt: { scroll: { incrementMin: 0, incrementMax: 0 } },
      apis: []
    }).prompt.scroll;
    const swapped = normalizeConfig({
      prompt: { scroll: { incrementMin: 5000, incrementMax: 0 } },
      apis: []
    }).prompt.scroll;

    expect(zeroScroll).toEqual({ incrementMin: 0, incrementMax: 0 });
    expect(swapped.incrementMax).toBeGreaterThanOrEqual(swapped.incrementMin);
  });
});
