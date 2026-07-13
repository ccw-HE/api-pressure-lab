import { describe, expect, it } from 'vitest';
import {
  buildOutputTokenCandidates,
  sampleNormalIndex,
  sampleExpectedOutputTokens
} from '../server/outputTokens.js';

describe('期望输出 token（正态分布 + 整齐阶梯）', () => {
  it('候选值只生成整齐的整数阶梯', () => {
    const candidates = buildOutputTokenCandidates({ min: 1500, max: 3000, step: 500 });
    expect(candidates).toEqual([1500, 2000, 2500, 3000]);
  });

  it('不同步长仍保持整齐阶梯', () => {
    expect(buildOutputTokenCandidates({ min: 1000, max: 4000, step: 1000 })).toEqual([
      1000, 2000, 3000, 4000
    ]);
  });

  it('min 等于 max 时只有一个候选值', () => {
    expect(buildOutputTokenCandidates({ min: 2000, max: 2000, step: 500 })).toEqual([2000]);
  });

  it('允许 0 作为唯一候选值', () => {
    const expected = { min: 0, max: 0, step: 500 };

    expect(buildOutputTokenCandidates(expected)).toEqual([0]);
    expect(sampleExpectedOutputTokens(expected)).toBe(0);
  });

  it('sampleNormalIndex 始终落在合法范围内', () => {
    for (let i = 0; i < 2000; i += 1) {
      const idx = sampleNormalIndex(4);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(3);
    }
  });

  it('抽样呈正态分布：中间两档明显高于两端', () => {
    const counts = { 1500: 0, 2000: 0, 2500: 0, 3000: 0 };
    const expected = { min: 1500, max: 3000, step: 500 };
    for (let i = 0; i < 20000; i += 1) {
      counts[sampleExpectedOutputTokens(expected)] += 1;
    }
    // 中间两档（2000/2500）合计应显著多于两端（1500/3000）合计。
    const middle = counts[2000] + counts[2500];
    const edges = counts[1500] + counts[3000];
    expect(middle).toBeGreaterThan(edges);
  });

  it('抽样结果始终是候选阶梯之一', () => {
    const expected = { min: 1500, max: 3000, step: 500 };
    const valid = new Set([1500, 2000, 2500, 3000]);
    for (let i = 0; i < 1000; i += 1) {
      expect(valid.has(sampleExpectedOutputTokens(expected))).toBe(true);
    }
  });
});
