import { describe, expect, it } from 'vitest';
import { buildCandidates, formatLatencySeconds } from '../src/utils/format.js';

describe('format utilities', () => {
  it('期望输出候选值从 0 开始时保留 0 档位', () => {
    expect(buildCandidates(0, 1000, 500)).toEqual([0, 500, 1000]);
  });

  it('延迟以秒显示并保留一位有效小数', () => {
    expect(formatLatencySeconds(0)).toBe('0s');
    expect(formatLatencySeconds(40538)).toBe('40.5s');
    expect(formatLatencySeconds(48399)).toBe('48.4s');
  });
});
